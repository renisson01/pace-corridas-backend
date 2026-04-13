#!/usr/bin/env node
/**
 * REGENI — Unificação de Atletas (Identity Resolution)
 *
 * Problema: o mesmo atleta aparece múltiplas vezes no banco com variações de nome.
 * Solução em 3 fases:
 *   Fase 1: Mesclagem por nome EXATO + mesmo gênero (mais seguro)
 *   Fase 2: Mesclagem por nome EXATO sem gênero (comum em corridas que não coletam gênero)
 *   Fase 3: Mesclagem por similarity >= THRESHOLD (nomes com typo/variação leve)
 *
 * MODO PADRÃO: apenas análise (dry-run)
 *
 * Uso:
 *   node scripts/unir-atletas.cjs                          # análise completa
 *   node scripts/unir-atletas.cjs --fase 1 --execute       # fase 1 segura
 *   node scripts/unir-atletas.cjs --fase 2 --execute       # fase 2
 *   node scripts/unir-atletas.cjs --fase 3 --threshold 0.85 --execute
 *   node scripts/unir-atletas.cjs --atleta "RENISSON" --buscar  # buscar variações de um atleta
 *   node scripts/unir-atletas.cjs --cpf "076.150.915-19" --nome "RENISSON NASCIMENTO ARAGÃO" --birth "1994-09-22"
 *     # Registrar identidade manual de atleta
 */

const { Client } = require('pg');
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL não definida'); process.exit(1); }

const args = process.argv.slice(2);
const getArg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const EXECUTE  = args.includes('--execute');
const FASE     = parseInt(getArg('--fase') || '0');
const THRESHOLD = parseFloat(getArg('--threshold') || '0.85');
const BUSCAR   = args.includes('--buscar');
const ATLETA   = getArg('--atleta');
const CPF_ARG  = getArg('--cpf');
const NOME_ARG = getArg('--nome');
const BIRTH_ARG = getArg('--birth');
const LIMIT    = parseInt(getArg('--limit') || '999999');
const DELAY    = ms => new Promise(r => setTimeout(r, ms));

function esc(s) { return String(s || '').replace(/'/g, "''"); }

// ─── MODO: buscar variações de um atleta ─────────────────────────────────────
async function buscarVariacoes(db) {
  if (!ATLETA) { console.error('--atleta "NOME" obrigatório para --buscar'); process.exit(1); }

  const r = await db.query(`
    SELECT a.id, a.name, a.gender, a.state, a."birthDate", a.cpf,
           COUNT(res.id) as resultados,
           similarity(a.name, $1) as sim
    FROM "Athlete" a
    LEFT JOIN "Result" res ON res."athleteId" = a.id
    WHERE similarity(a.name, $1) > 0.5
    GROUP BY a.id, a.name, a.gender, a.state, a."birthDate", a.cpf
    ORDER BY sim DESC
    LIMIT 30
  `, [ATLETA.toUpperCase()]);

  console.log(`\nVariações encontradas para "${ATLETA}":\n`);
  for (const row of r.rows) {
    const birth = row.birthDate ? new Date(row.birthDate).toLocaleDateString('pt-BR') : 'sem data';
    const cpf = row.cpf ? `CPF:${row.cpf}` : '';
    console.log(`  [${row.sim.toFixed(2)}] "${row.name}" | ${row.gender||'?'}/${row.state||'?'} | ${birth} ${cpf} | ${row.resultados} resultados`);
    console.log(`         id: ${row.id}`);
  }

  // Mostrar resultados do atleta mais parecido
  const best = r.rows[0];
  if (best && parseInt(best.resultados) > 0) {
    const res = await db.query(`
      SELECT race.name, race.date, res.distance, res.time, res.pace, res."overallRank"
      FROM "Result" res JOIN "Race" race ON race.id = res."raceId"
      WHERE res."athleteId" = $1
      ORDER BY race.date DESC
    `, [best.id]);
    console.log(`\nResultados de "${best.name}" (id: ${best.id}):`);
    for (const r of res.rows) {
      console.log(`  ${new Date(r.date).toLocaleDateString('pt-BR')} | ${r.name} | ${r.distance} | ${r.time} | pace ${r.pace} | #${r.overallRank || '—'}`);
    }
  }
}

// ─── MODO: registrar identidade manual ────────────────────────────────────────
async function registrarIdentidade(db) {
  if (!NOME_ARG) { console.error('--nome "NOME COMPLETO" obrigatório'); process.exit(1); }

  const cpfLimpo = CPF_ARG ? CPF_ARG.replace(/\D/g, '') : null;
  // Parse DD/MM/YYYY ou YYYY-MM-DD
  let birthDate = null;
  if (BIRTH_ARG) {
    const parts = BIRTH_ARG.includes('/') ? BIRTH_ARG.split('/') : BIRTH_ARG.split('-');
    if (BIRTH_ARG.includes('/')) {
      // DD/MM/YYYY → YYYY-MM-DD
      birthDate = new Date(`${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}T12:00:00`);
    } else {
      birthDate = new Date(`${BIRTH_ARG}T12:00:00`);
    }
  }

  console.log(`\nRegistrando identidade:`);
  console.log(`  Nome: ${NOME_ARG}`);
  console.log(`  CPF: ${cpfLimpo || '(não informado)'}`);
  console.log(`  Nascimento: ${birthDate ? birthDate.toLocaleDateString('pt-BR') : '(não informado)'}`);

  // Buscar todos os atletas que provavelmente são esta pessoa
  const r = await db.query(`
    SELECT a.id, a.name, a.gender, a.state, a."birthDate", a.cpf,
           COUNT(res.id) as resultados,
           similarity(a.name, $1) as sim
    FROM "Athlete" a
    LEFT JOIN "Result" res ON res."athleteId" = a.id
    WHERE similarity(a.name, $1) > 0.70
    GROUP BY a.id, a.name, a.gender, a.state, a."birthDate", a.cpf
    ORDER BY resultados DESC, sim DESC
  `, [NOME_ARG.toUpperCase()]);

  console.log(`\nAtletas candidatos (${r.rows.length} encontrados):`);
  let totalResultados = 0;
  for (const row of r.rows) {
    const birth = row.birthDate ? new Date(row.birthDate).toLocaleDateString('pt-BR') : '—';
    console.log(`  [sim=${row.sim.toFixed(2)}] "${row.name}" | ${row.resultados} resultados | nasc: ${birth}`);
    totalResultados += parseInt(row.resultados);
  }
  console.log(`\nTOTAL: ${r.rows.length} registros, ${totalResultados} resultados a unificar`);

  if (!EXECUTE) {
    console.log('\n[DRY RUN] Para executar a unificação:');
    const cmd = `node scripts/unir-atletas.cjs --nome "${NOME_ARG}"`;
    const extras = [];
    if (CPF_ARG) extras.push(`--cpf "${CPF_ARG}"`);
    if (BIRTH_ARG) extras.push(`--birth "${BIRTH_ARG}"`);
    console.log(`  ${cmd} ${extras.join(' ')} --execute`);
    return;
  }

  // Executar: mesclar todos para o registro com mais resultados
  const ids = r.rows.map(row => row.id);
  const masterId = r.rows[0].id; // o que tem mais resultados
  const outroIds = ids.slice(1);

  // Atualizar CPF e birthDate no master
  if (cpfLimpo || birthDate) {
    await db.query(`
      UPDATE "Athlete" SET
        cpf = COALESCE(cpf, $1),
        "birthDate" = COALESCE("birthDate", $2)
      WHERE id = $3
    `, [cpfLimpo, birthDate, masterId]);
    console.log(`\n  CPF e birthDate atualizados no master (${masterId})`);
  }

  // Redirecionar resultados
  let movidos = 0;
  for (const dupId of outroIds) {
    const upd = await db.query(`
      UPDATE "Result" SET "athleteId" = $1
      WHERE "athleteId" = $2
      AND NOT EXISTS (
        SELECT 1 FROM "Result" r2 WHERE r2."athleteId" = $1 AND r2."raceId" = "Result"."raceId"
      )
    `, [masterId, dupId]);
    movidos += upd.rowCount;
    await db.query('DELETE FROM "Result" WHERE "athleteId" = $1', [dupId]);
    await db.query('DELETE FROM "Athlete" WHERE id = $1', [dupId]);
  }

  // Atualizar totalRaces
  const cnt = await db.query('SELECT COUNT(DISTINCT "raceId") c FROM "Result" WHERE "athleteId"=$1', [masterId]);
  await db.query('UPDATE "Athlete" SET "totalRaces"=$1 WHERE id=$2', [parseInt(cnt.rows[0].c), masterId]);

  console.log(`\n✅ Identidade unificada!`);
  console.log(`   Master: ${masterId} ("${r.rows[0].name}")`);
  console.log(`   Removidos: ${outroIds.length} duplicatas`);
  console.log(`   Resultados movidos: ${movidos}`);
  console.log(`   Total de provas: ${cnt.rows[0].c}`);
}

// ─── ANÁLISE GERAL ────────────────────────────────────────────────────────────
async function analisar(db) {
  console.log('=== ANÁLISE DE DUPLICATAS ===\n');

  const stats = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM "Athlete") total_atletas,
      (SELECT COUNT(*) FROM "Result") total_resultados,
      (SELECT COUNT(*) FROM "Athlete" WHERE "birthDate" IS NOT NULL) com_birth,
      (SELECT COUNT(*) FROM "Athlete" WHERE cpf IS NOT NULL) com_cpf
  `);
  const s = stats.rows[0];
  console.log(`Atletas: ${s.total_atletas} | Resultados: ${s.total_resultados}`);
  console.log(`Com birthDate: ${s.com_birth} | Com CPF: ${s.com_cpf}\n`);

  // Fase 1: nome exato + mesmo gênero
  const f1 = await db.query(`
    SELECT COUNT(*) grupos, SUM(qtd-1) a_remover FROM (
      SELECT name, gender, COUNT(*) qtd
      FROM "Athlete"
      WHERE gender IS NOT NULL
      GROUP BY name, gender
      HAVING COUNT(*) > 1
    ) sub
  `);
  console.log(`FASE 1 (nome exato + mesmo gênero): ${f1.rows[0].grupos} grupos → ${f1.rows[0].a_remover} a remover`);

  // Fase 2: nome exato sem gênero
  const f2 = await db.query(`
    SELECT COUNT(*) grupos, SUM(qtd-1) a_remover FROM (
      SELECT name, COUNT(*) qtd
      FROM "Athlete"
      WHERE gender IS NULL
      GROUP BY name
      HAVING COUNT(*) > 1
    ) sub
  `);
  console.log(`FASE 2 (nome exato, sem gênero): ${f2.rows[0].grupos} grupos → ${f2.rows[0].a_remover} a remover`);

  // Fase 3: similarity (estimativa em amostra)
  console.log(`FASE 3 (similarity >= ${THRESHOLD}): requer análise por lote — use --fase 3`);

  const total_removivel = (parseInt(f1.rows[0].a_remover)||0) + (parseInt(f2.rows[0].a_remover)||0);
  console.log(`\nTotal seguro para remover (fases 1+2): ${total_removivel.toLocaleString('pt-BR')}`);
  console.log('\nPara executar por fase:');
  console.log('  node scripts/unir-atletas.cjs --fase 1 --execute');
  console.log('  node scripts/unir-atletas.cjs --fase 2 --execute');
  console.log('  node scripts/unir-atletas.cjs --atleta "SEU NOME" --buscar');
}

// ─── MERGE FASE 1: nome exato + mesmo gênero ─────────────────────────────────
async function fase1(db) {
  console.log('\n=== FASE 1: Nome exato + mesmo gênero ===');

  const grupos = await db.query(`
    SELECT name, gender, ARRAY_AGG(id ORDER BY "createdAt" ASC) ids, COUNT(*) qtd
    FROM "Athlete"
    WHERE gender IS NOT NULL
    GROUP BY name, gender
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT $1
  `, [LIMIT]);

  console.log(`${grupos.rows.length} grupos a processar`);
  if (!EXECUTE) {
    console.log('[DRY RUN] Adicione --execute para mesclar');
    console.log('Exemplos:');
    for (const g of grupos.rows.slice(0, 5)) {
      console.log(`  "${g.name}" (${g.gender}) × ${g.qtd} — ids: ${g.ids.slice(0,3).join(', ')}`);
    }
    return;
  }

  let mesclados = 0, erros = 0;
  for (let i = 0; i < grupos.rows.length; i++) {
    const g = grupos.rows[i];
    const masterId = g.ids[0];
    const outroIds = g.ids.slice(1);

    try {
      for (const dupId of outroIds) {
        await db.query(`
          UPDATE "Result" SET "athleteId" = $1
          WHERE "athleteId" = $2
          AND NOT EXISTS (
            SELECT 1 FROM "Result" r2 WHERE r2."athleteId" = $1 AND r2."raceId" = "Result"."raceId"
          )
        `, [masterId, dupId]);
        await db.query('DELETE FROM "Result" WHERE "athleteId" = $1', [dupId]);
        await db.query('DELETE FROM "Athlete" WHERE id = $1', [dupId]);
        mesclados++;
      }
    } catch(e) { erros++; if (erros <= 3) console.error(`  Erro: ${e.message.slice(0,60)}`); }

    if ((i+1) % 1000 === 0) process.stdout.write(`\r  Progresso: ${i+1}/${grupos.rows.length} grupos | ${mesclados} removidos`);
    await DELAY(1);
  }

  console.log(`\n✅ Fase 1 concluída: ${mesclados} atletas removidos, ${erros} erros`);
}

// ─── MERGE FASE 2: nome exato sem gênero ─────────────────────────────────────
async function fase2(db) {
  console.log('\n=== FASE 2: Nome exato sem gênero ===');

  const grupos = await db.query(`
    SELECT name, ARRAY_AGG(id ORDER BY "createdAt" ASC) ids, COUNT(*) qtd
    FROM "Athlete"
    WHERE gender IS NULL
    GROUP BY name
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT $1
  `, [LIMIT]);

  console.log(`${grupos.rows.length} grupos a processar`);
  if (!EXECUTE) {
    console.log('[DRY RUN] Adicione --execute para mesclar');
    return;
  }

  let mesclados = 0, erros = 0;
  for (let i = 0; i < grupos.rows.length; i++) {
    const g = grupos.rows[i];
    const masterId = g.ids[0];
    const outroIds = g.ids.slice(1);

    try {
      for (const dupId of outroIds) {
        await db.query(`
          UPDATE "Result" SET "athleteId" = $1
          WHERE "athleteId" = $2
          AND NOT EXISTS (
            SELECT 1 FROM "Result" r2 WHERE r2."athleteId" = $1 AND r2."raceId" = "Result"."raceId"
          )
        `, [masterId, dupId]);
        await db.query('DELETE FROM "Result" WHERE "athleteId" = $1', [dupId]);
        await db.query('DELETE FROM "Athlete" WHERE id = $1', [dupId]);
        mesclados++;
      }
    } catch(e) { erros++; }

    if ((i+1) % 1000 === 0) process.stdout.write(`\r  Progresso: ${i+1}/${grupos.rows.length} | ${mesclados} removidos`);
    await DELAY(1);
  }

  console.log(`\n✅ Fase 2 concluída: ${mesclados} atletas removidos, ${erros} erros`);
}

// ─── MERGE FASE 3: similarity ─────────────────────────────────────────────────
async function fase3(db) {
  console.log(`\n=== FASE 3: Similarity >= ${THRESHOLD} ===`);
  console.log('(Processa em lotes de nomes com primeiro token igual)\n');

  // Estratégia: agrupar por primeiro nome (mais eficiente)
  const primeiros = await db.query(`
    SELECT SPLIT_PART(name, ' ', 1) as primeiro, COUNT(*) as qtd
    FROM "Athlete"
    GROUP BY primeiro
    HAVING COUNT(*) > 1
    ORDER BY qtd DESC
    LIMIT 500
  `);

  console.log(`${primeiros.rows.length} primeiros nomes para analisar`);

  let totalMesclados = 0;

  for (const { primeiro } of primeiros.rows.slice(0, EXECUTE ? 500 : 5)) {
    const atletas = await db.query(`
      SELECT id, name, gender, state
      FROM "Athlete"
      WHERE name LIKE $1 || ' %' OR name = $1
      ORDER BY "createdAt" ASC
    `, [primeiro]);

    if (atletas.rows.length < 2) continue;

    // Encontrar pares similares dentro do grupo
    const grupos = [];
    const processados = new Set();

    for (let i = 0; i < atletas.rows.length; i++) {
      if (processados.has(atletas.rows[i].id)) continue;
      const grupo = [atletas.rows[i]];
      processados.add(atletas.rows[i].id);

      for (let j = i + 1; j < atletas.rows.length; j++) {
        if (processados.has(atletas.rows[j].id)) continue;
        const a1 = atletas.rows[i], a2 = atletas.rows[j];

        // Verificar gênero (não misturar M com F)
        if (a1.gender && a2.gender && a1.gender !== a2.gender) continue;

        const simRes = await db.query('SELECT similarity($1, $2) s', [a1.name, a2.name]);
        const sim = parseFloat(simRes.rows[0].s);

        if (sim >= THRESHOLD) {
          grupo.push(atletas.rows[j]);
          processados.add(atletas.rows[j].id);
        }
      }

      if (grupo.length > 1) grupos.push(grupo);
    }

    if (!EXECUTE) {
      for (const g of grupos.slice(0, 3)) {
        console.log(`  [${primeiro}] ${g.map(a => `"${a.name}"`).join(' ↔ ')}`);
      }
      continue;
    }

    // Mesclar grupos
    for (const grupo of grupos) {
      const masterId = grupo[0].id;
      for (const dup of grupo.slice(1)) {
        try {
          await db.query(`
            UPDATE "Result" SET "athleteId" = $1
            WHERE "athleteId" = $2
            AND NOT EXISTS (SELECT 1 FROM "Result" r2 WHERE r2."athleteId" = $1 AND r2."raceId" = "Result"."raceId")
          `, [masterId, dup.id]);
          await db.query('DELETE FROM "Result" WHERE "athleteId" = $1', [dup.id]);
          await db.query('DELETE FROM "Athlete" WHERE id = $1', [dup.id]);
          totalMesclados++;
        } catch(_) {}
      }
    }
  }

  console.log(`\n✅ Fase 3: ${totalMesclados} atletas mesclados`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  console.log('Conectado!\n');

  // Garantir pg_trgm
  await db.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');

  if (BUSCAR) {
    await buscarVariacoes(db);
  } else if (CPF_ARG || (NOME_ARG && BIRTH_ARG)) {
    await registrarIdentidade(db);
  } else if (FASE === 1) {
    await fase1(db);
  } else if (FASE === 2) {
    await fase2(db);
  } else if (FASE === 3) {
    await fase3(db);
  } else {
    await analisar(db);
  }

  if (EXECUTE) {
    const final = await db.query('SELECT (SELECT COUNT(*) FROM "Athlete") a,(SELECT COUNT(*) FROM "Result") res');
    console.log(`\nBanco: ${final.rows[0].a} atletas | ${final.rows[0].res} resultados`);
  }

  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
