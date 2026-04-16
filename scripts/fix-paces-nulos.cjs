#!/usr/bin/env node
/**
 * REGENI — Fix paces nulos
 * Recalcula pace para resultados onde pace=NULL mas time+distance estão disponíveis
 */

const { Client } = require('pg');
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL não definida'); process.exit(1); }

const DIST_MAP = {
  '3K':3,'5K':5,'8K':8,'10K':10,'12K':12,'15K':15,'16K':16,'18K':18,
  '21K':21,'21.1K':21.1,'22K':22,'24K':24,'25K':25,'30K':30,'42K':42,
  '42.2K':42.2,'43K':43,'5':5,'10':10,'21':21,'42':42
};

function timeToSec(t) {
  if (!t) return null;
  const parts = String(t).trim().split(':').map(Number);
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  if (parts.length === 2) return parts[0]*60 + parts[1];
  return null;
}

function calcPace(time, distance) {
  const secs = timeToSec(time);
  const km = DIST_MAP[distance] || parseFloat(distance);
  if (!secs || !km || km <= 0) return null;
  const paceSec = secs / km;
  const min = Math.floor(paceSec / 60);
  const sec = Math.round(paceSec % 60);
  return `${min}:${String(sec).padStart(2,'0')}`;
}

async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();

  const rows = await db.query(`
    SELECT id, time, distance FROM "Result"
    WHERE pace IS NULL AND time IS NOT NULL
    LIMIT 5000
  `);

  console.log(`${rows.rows.length} resultados para processar`);

  let fixed = 0, skipped = 0;
  for (const row of rows.rows) {
    const pace = calcPace(row.time, row.distance);
    if (!pace) { skipped++; continue; }

    await db.query('UPDATE "Result" SET pace=$1 WHERE id=$2', [pace, row.id]);
    fixed++;
  }

  console.log(`✅ ${fixed} paces recalculados | ${skipped} sem dados suficientes`);

  const remaining = await db.query('SELECT COUNT(*) c FROM "Result" WHERE pace IS NULL');
  console.log(`Paces nulos restantes: ${remaining.rows[0].c}`);

  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
