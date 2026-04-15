#!/usr/bin/env node
/**
 * REGENI — Atualiza o Obsidian com estado atual do banco via Local REST API
 *
 * Uso:
 *   node scripts/update-obsidian.cjs
 *   node scripts/update-obsidian.cjs --date 2026-04-14
 */
'use strict';
const { Client } = require('pg');
const http = require('http');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL não definida'); process.exit(1); }

const OBSIDIAN_URL = 'http://127.0.0.1:27123';
const OBSIDIAN_TOKEN = '0a33fd6b6e792c38039f9760d8a294973dd76ef50b5fdfa3f354bfe7474cfa3e';

const args = process.argv.slice(2);
const getArg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const DATE = getArg('--date') || new Date().toISOString().slice(0, 10);

// ─── Obsidian PUT ─────────────────────────────────────────────────────────────
function obsidianPut(path, content) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(content, 'utf8');
    const req = http.request({
      hostname: '127.0.0.1',
      port: 27123,
      path: '/vault/' + path,
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + OBSIDIAN_TOKEN,
        'Content-Type': 'text/markdown',
        'Content-Length': body.length,
      },
    }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();

  const r = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM "Race") AS corridas,
      (SELECT COUNT(*) FROM "Result") AS resultados,
      (SELECT COUNT(*) FROM "Athlete") AS atletas,
      (SELECT COUNT(*) FROM "Result" WHERE id LIKE 'ctr_%') AS chiptiming,
      (SELECT COUNT(*) FROM "Result" WHERE id LIKE 'sc_%') AS sportschrono,
      (SELECT COUNT(*) FROM "Result" WHERE id LIKE 'rk_%') AS runking,
      (SELECT COUNT(*) FROM "Result" WHERE id LIKE 'ccr_%') AS cronoschip,
      (SELECT COUNT(*) FROM "Result" WHERE id LIKE 'gcr_%') AS globalcrono,
      (SELECT COUNT(*) FROM "Result" WHERE id LIKE 'ctn_%') AS central
  `);
  const d = r.rows[0];
  await db.end();

  const fmt = n => parseInt(n).toLocaleString('pt-BR');
  const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const content = `---
type: daily
date: ${DATE}
---
# Daily — ${DATE} (atualizado ${now})

## 📊 Estado do Banco
| Métrica | Valor |
|---------|-------|
| Corridas | ${fmt(d.corridas)} |
| Resultados | ${fmt(d.resultados)} |
| Atletas | ${fmt(d.atletas)} |

## 📦 Resultados por Fonte
| Fonte | Resultados |
|-------|-----------|
| ChipTiming | ${fmt(d.chiptiming)} |
| SportsChrono | ${fmt(d.sportschrono)} |
| CronosChip | ${fmt(d.cronoschip)} |
| GlobalCronometragem | ${fmt(d.globalcrono)} |
| Central de Resultados | ${fmt(d.central)} |
| Runking | ${fmt(d.runking)} |

_Atualizado automaticamente em ${new Date().toISOString()}_
`;

  const vaultPath = `cerebro/daily/${DATE}.md`;
  const status = await obsidianPut(vaultPath, content);
  console.log(`Obsidian ${vaultPath} → HTTP ${status}`);
  console.log(`Banco: ${fmt(d.corridas)} corridas | ${fmt(d.resultados)} resultados | ${fmt(d.atletas)} atletas`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
