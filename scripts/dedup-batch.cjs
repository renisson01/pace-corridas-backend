#!/usr/bin/env node
/**
 * REGENI — Dedup em lote (SQL batch)
 * Muito mais rápido que row-by-row
 *
 * Usa CTEs para fazer tudo em poucas queries grandes:
 * 1. Identificar grupo de duplicatas (nome + gênero)
 * 2. Mover resultados (em lote)
 * 3. Deletar atletas secundários (em lote)
 */

const { Client } = require('pg');
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL não definida'); process.exit(1); }

const EXECUTE = process.argv.includes('--execute');
const BATCH = parseInt(process.argv[process.argv.indexOf('--batch') + 1] || '5000');

async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  console.log('Conectado!\n');

  const stats0 = await db.query('SELECT (SELECT COUNT(*) FROM "Athlete") a, (SELECT COUNT(*) FROM "Result") r');
  console.log(`Início: ${stats0.rows[0].a} atletas | ${stats0.rows[0].r} resultados\n`);

  // ── Análise ────────────────────────────────────────────────────────────────
  const analysis = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM (
        SELECT name, gender FROM "Athlete" WHERE gender IS NOT NULL GROUP BY name, gender HAVING COUNT(*) > 1
      ) s) grupos_genero,
      (SELECT COALESCE(SUM(qtd-1),0) FROM (
        SELECT COUNT(*) qtd FROM "Athlete" WHERE gender IS NOT NULL GROUP BY name, gender HAVING COUNT(*) > 1
      ) s) a_remover_genero,
      (SELECT COUNT(*) FROM (
        SELECT name FROM "Athlete" WHERE gender IS NULL GROUP BY name HAVING COUNT(*) > 1
      ) s) grupos_sem_genero,
      (SELECT COALESCE(SUM(qtd-1),0) FROM (
        SELECT COUNT(*) qtd FROM "Athlete" WHERE gender IS NULL GROUP BY name HAVING COUNT(*) > 1
      ) s) a_remover_sem_genero
  `);
  const a = analysis.rows[0];
  const totalRemover = parseInt(a.a_remover_genero) + parseInt(a.a_remover_sem_genero);
  console.log(`Grupos com gênero: ${a.grupos_genero} → ${a.a_remover_genero} a remover`);
  console.log(`Grupos sem gênero: ${a.grupos_sem_genero} → ${a.a_remover_sem_genero} a remover`);
  console.log(`TOTAL: ${totalRemover.toLocaleString('pt-BR')} atletas redundantes\n`);

  if (!EXECUTE) {
    console.log('Modo análise. Use --execute para mesclar.');
    await db.end();
    return;
  }

  // ── FASE 1: com gênero — mover resultados ────────────────────────────────
  console.log('FASE 1: Movendo resultados dos duplicados → primários (nome+gênero)...');
  let t0 = Date.now();

  const moved1 = await db.query(`
    WITH grupos AS (
      SELECT
        name, gender,
        MIN(id) AS primary_id,
        ARRAY_AGG(id ORDER BY id ASC) AS all_ids
      FROM "Athlete"
      WHERE gender IS NOT NULL
      GROUP BY name, gender
      HAVING COUNT(*) > 1
    ),
    duplicatas AS (
      SELECT g.primary_id, unnest(all_ids[2:]) AS dup_id
      FROM grupos g
    )
    UPDATE "Result" r
    SET "athleteId" = d.primary_id
    FROM duplicatas d
    WHERE r."athleteId" = d.dup_id
      AND NOT EXISTS (
        SELECT 1 FROM "Result" r2
        WHERE r2."athleteId" = d.primary_id AND r2."raceId" = r."raceId"
      )
  `);
  console.log(`  ${moved1.rowCount} resultados movidos (${Date.now()-t0}ms)`);

  // ── FASE 1: deletar resultados órfãos dos duplicados ─────────────────────
  console.log('  Deletando resultados órfãos dos duplicados...');
  t0 = Date.now();
  const del1res = await db.query(`
    WITH grupos AS (
      SELECT MIN(id) AS primary_id, ARRAY_AGG(id ORDER BY id ASC) AS all_ids
      FROM "Athlete"
      WHERE gender IS NOT NULL
      GROUP BY name, gender
      HAVING COUNT(*) > 1
    ),
    duplicatas AS (
      SELECT unnest(all_ids[2:]) AS dup_id FROM grupos
    )
    DELETE FROM "Result" r
    USING duplicatas d
    WHERE r."athleteId" = d.dup_id
  `);
  console.log(`  ${del1res.rowCount} resultados órfãos deletados (${Date.now()-t0}ms)`);

  // ── FASE 1: deletar atletas duplicados ───────────────────────────────────
  console.log('  Deletando atletas duplicados (com gênero)...');
  t0 = Date.now();
  const del1atl = await db.query(`
    WITH grupos AS (
      SELECT MIN(id) AS primary_id, ARRAY_AGG(id ORDER BY id ASC) AS all_ids
      FROM "Athlete"
      WHERE gender IS NOT NULL
      GROUP BY name, gender
      HAVING COUNT(*) > 1
    ),
    duplicatas AS (
      SELECT unnest(all_ids[2:]) AS dup_id FROM grupos
    )
    DELETE FROM "Athlete" a
    USING duplicatas d
    WHERE a.id = d.dup_id
  `);
  console.log(`  ${del1atl.rowCount} atletas deletados (${Date.now()-t0}ms)`);

  // ── FASE 2: sem gênero ────────────────────────────────────────────────────
  console.log('\nFASE 2: Duplicados sem gênero...');
  t0 = Date.now();
  const moved2 = await db.query(`
    WITH grupos AS (
      SELECT name, MIN(id) AS primary_id, ARRAY_AGG(id ORDER BY id ASC) AS all_ids
      FROM "Athlete"
      WHERE gender IS NULL
      GROUP BY name
      HAVING COUNT(*) > 1
    ),
    duplicatas AS (
      SELECT g.primary_id, unnest(all_ids[2:]) AS dup_id FROM grupos g
    )
    UPDATE "Result" r
    SET "athleteId" = d.primary_id
    FROM duplicatas d
    WHERE r."athleteId" = d.dup_id
      AND NOT EXISTS (
        SELECT 1 FROM "Result" r2
        WHERE r2."athleteId" = d.primary_id AND r2."raceId" = r."raceId"
      )
  `);
  console.log(`  ${moved2.rowCount} resultados movidos (${Date.now()-t0}ms)`);

  const del2res = await db.query(`
    WITH grupos AS (
      SELECT MIN(id) AS primary_id, ARRAY_AGG(id ORDER BY id ASC) AS all_ids
      FROM "Athlete"
      WHERE gender IS NULL
      GROUP BY name
      HAVING COUNT(*) > 1
    ),
    duplicatas AS (
      SELECT unnest(all_ids[2:]) AS dup_id FROM grupos
    )
    DELETE FROM "Result" r USING duplicatas d WHERE r."athleteId" = d.dup_id
  `);
  const del2atl = await db.query(`
    WITH grupos AS (
      SELECT MIN(id) AS primary_id, ARRAY_AGG(id ORDER BY id ASC) AS all_ids
      FROM "Athlete"
      WHERE gender IS NULL
      GROUP BY name
      HAVING COUNT(*) > 1
    ),
    duplicatas AS (
      SELECT unnest(all_ids[2:]) AS dup_id FROM grupos
    )
    DELETE FROM "Athlete" a USING duplicatas d WHERE a.id = d.dup_id
  `);
  console.log(`  ${del2res.rowCount} resultados órfãos | ${del2atl.rowCount} atletas deletados`);

  // ── Atualizar totalRaces ──────────────────────────────────────────────────
  console.log('\nAtualizando totalRaces...');
  t0 = Date.now();
  await db.query(`
    UPDATE "Athlete" a
    SET "totalRaces" = sub.cnt
    FROM (
      SELECT "athleteId", COUNT(DISTINCT "raceId") cnt
      FROM "Result"
      GROUP BY "athleteId"
    ) sub
    WHERE a.id = sub."athleteId"
  `);
  console.log(`  totalRaces atualizado (${Date.now()-t0}ms)`);

  const statsF = await db.query('SELECT (SELECT COUNT(*) FROM "Athlete") a, (SELECT COUNT(*) FROM "Result") r');
  console.log(`\n✅ FIM: ${statsF.rows[0].a} atletas | ${statsF.rows[0].r} resultados`);

  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
