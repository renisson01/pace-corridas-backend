#!/usr/bin/env node
/**
 * REGENI — Deduplicação de Atletas
 * Encontra duplicatas por (nome normalizado + birthDate) e mescla resultados
 *
 * Modo SEGURO por padrão — mostra análise sem deletar
 * Use --execute para realmente mesclar (apenas após confirmar a análise)
 *
 * Uso:
 *   node scripts/deduplicar-atletas.cjs                    # análise (safe)
 *   node scripts/deduplicar-atletas.cjs --execute          # mescla e deleta duplicatas
 *   node scripts/deduplicar-atletas.cjs --execute --limit 100  # processa só 100 grupos
 */

const { Client } = require('pg');
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL não definida'); process.exit(1); }

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const LIMIT = parseInt(args[args.indexOf('--limit') + 1] || '9999');
const DELAY = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  console.log('Conectado!\n');

  // ── Estatísticas iniciais ──────────────────────────────────────────────────
  const stats = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM "Athlete") total_atletas,
      (SELECT COUNT(*) FROM "Athlete" WHERE "birthDate" IS NOT NULL) com_birthdate,
      (SELECT COUNT(*) FROM "Result") total_resultados
  `);
  const s = stats.rows[0];
  console.log(`Banco atual: ${s.total_atletas} atletas | ${s.com_birthdate} com birthDate | ${s.total_resultados} resultados\n`);

  // ── Encontrar grupos duplicados ────────────────────────────────────────────
  // Duplicatas por: mesmo nome normalizado + mesma birthDate (não nula)
  console.log('Analisando duplicatas por (nome + birthDate)...');
  const dupsQuery = await db.query(`
    SELECT
      UPPER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) AS nome_norm,
      "birthDate"::date AS birth,
      COUNT(*) AS qtd,
      ARRAY_AGG(id ORDER BY "createdAt" ASC) AS ids,
      ARRAY_AGG("totalRaces" ORDER BY "createdAt" ASC) AS races_list
    FROM "Athlete"
    WHERE "birthDate" IS NOT NULL
      AND "birthDate" > '1920-01-01'
    GROUP BY nome_norm, birth
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT $1
  `, [LIMIT]);

  const grupos = dupsQuery.rows;
  const totalDuplicates = grupos.reduce((s, g) => s + parseInt(g.qtd) - 1, 0);
  const totalGroups = grupos.length;

  console.log(`\nEncontrados: ${totalGroups} grupos de duplicatas`);
  console.log(`Atletas duplicados a remover: ${totalDuplicates}`);

  // Mostrar exemplos
  console.log('\n--- Top 20 grupos duplicados ---');
  for (const g of grupos.slice(0, 20)) {
    console.log(`  "${g.nome_norm}" (${g.birth?.toISOString?.()?.slice(0, 10) || g.birth}) × ${g.qtd} cópias`);
    console.log(`    IDs: ${g.ids.slice(0, 5).join(', ')}${g.ids.length > 5 ? '...' : ''}`);
  }

  // ── Análise sem birthDate: duplicatas só por nome ─────────────────────────
  console.log('\n\nAnalisando duplicatas por nome (sem birthDate)...');
  const dupsNameOnly = await db.query(`
    SELECT
      UPPER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) AS nome_norm,
      COUNT(*) AS qtd
    FROM "Athlete"
    WHERE "birthDate" IS NULL
    GROUP BY nome_norm
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 10
  `);
  const totalNameDups = dupsNameOnly.rows.reduce((s, g) => s + parseInt(g.qtd) - 1, 0);
  console.log(`  Duplicatas por nome (sem birthDate): ${dupsNameOnly.rows.length} grupos, ~${totalNameDups} duplicados`);
  console.log('  (Não serão mescladas automaticamente — sem birthDate, risco de falso positivo)');

  if (!EXECUTE) {
    console.log(`\n========================================`);
    console.log(`ANÁLISE COMPLETA — modo READ ONLY`);
    console.log(`  ${totalGroups} grupos de duplicatas identificados`);
    console.log(`  ${totalDuplicates} atletas redundantes para remover`);
    console.log(`\nPara executar: node scripts/deduplicar-atletas.cjs --execute`);
    console.log(`========================================`);
    await db.end();
    process.exit(0);
  }

  // ── EXECUÇÃO: Mesclar duplicatas ──────────────────────────────────────────
  console.log(`\n\n=== EXECUTANDO MESCLAGEM DE ${totalGroups} GRUPOS ===`);
  console.log('Estratégia: manter o registro mais antigo (createdAt ASC), redirecionar resultados\n');

  let mesclados = 0;
  let erros = 0;

  for (let i = 0; i < grupos.length; i++) {
    const g = grupos[i];
    const ids = g.ids; // ordenados por createdAt ASC
    const keepId = ids[0]; // manter o mais antigo
    const removeIds = ids.slice(1); // remover os demais

    try {
      // 1. Redirecionar resultados dos duplicados para o principal
      //    (ON CONFLICT DO NOTHING ignora se já existe result para esse atleta nessa corrida)
      for (const dupId of removeIds) {
        await db.query(`
          UPDATE "Result" SET "athleteId" = $1
          WHERE "athleteId" = $2
          AND NOT EXISTS (
            SELECT 1 FROM "Result" r2
            WHERE r2."athleteId" = $1 AND r2."raceId" = "Result"."raceId"
          )
        `, [keepId, dupId]);
      }

      // 2. Atualizar totalRaces do atleta principal (soma de todos)
      const totalRacesRes = await db.query(
        'SELECT COUNT(DISTINCT "raceId") c FROM "Result" WHERE "athleteId"=$1', [keepId]
      );
      const totalRaces = parseInt(totalRacesRes.rows[0].c) || 1;
      await db.query('UPDATE "Athlete" SET "totalRaces"=$1 WHERE id=$2', [totalRaces, keepId]);

      // 3. Deletar os duplicados (resultados órfãos são deletados em cascata ou ignorados)
      for (const dupId of removeIds) {
        await db.query('DELETE FROM "Result" WHERE "athleteId"=$1', [dupId]);
        await db.query('DELETE FROM "Athlete" WHERE id=$1', [dupId]);
      }

      mesclados += removeIds.length;

      if ((i + 1) % 100 === 0 || i === grupos.length - 1) {
        process.stdout.write(`\r  Progresso: ${i + 1}/${grupos.length} grupos | ${mesclados} atletas removidos`);
      }
    } catch (e) {
      erros++;
      if (erros <= 5) console.error(`\n  Erro no grupo "${g.nome_norm}": ${e.message.slice(0, 80)}`);
    }

    await DELAY(10);
  }

  console.log(`\n\nMesclagem concluída:`);
  console.log(`  ${mesclados} atletas duplicados removidos`);
  console.log(`  ${erros} erros`);

  const final = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM "Athlete") total_atletas,
      (SELECT COUNT(*) FROM "Result") total_resultados
  `);
  console.log(`\nBanco final: ${final.rows[0].total_atletas} atletas | ${final.rows[0].total_resultados} resultados`);

  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
