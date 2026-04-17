#!/usr/bin/env node
/**
 * validar-resultados.cjs — Fase 1 do Sistema de Qualidade de Dados
 *
 * Marca resultados inválidos com flagged=true + flagReason.
 * NUNCA deleta. NUNCA edita tempo/pace original.
 *
 * Uso: node scripts/validar-resultados.cjs
 */
'use strict';

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// ─── Limites de pace (segundos/km) por distância ─────────────────────────────
// Fonte: cerebro/11-QUALIDADE-DADOS.md
const LIMITES = {
  '3K':  { min: 140, max: 600 },  // 2:20 – 10:00
  '5K':  { min: 145, max: 600 },  // 2:25 – 10:00
  '6K':  { min: 148, max: 600 },  // 2:28 – 10:00
  '7K':  { min: 150, max: 600 },  // 2:30 – 10:00
  '8K':  { min: 150, max: 600 },  // 2:30 – 10:00
  '10K': { min: 150, max: 600 },  // 2:30 – 10:00
  '12K': { min: 155, max: 600 },  // 2:35 – 10:00
  '15K': { min: 155, max: 600 },  // 2:35 – 10:00
  '21K': { min: 160, max: 600 },  // 2:40 – 10:00
  '42K': { min: 165, max: 600 },  // 2:45 – 10:00
};

// Formato do campo pace: "MM:SS" (ex: "05:30" = 5min30s/km = 330seg/km)
// SQL: SPLIT_PART(pace,':',1)::int * 60 + SPLIT_PART(pace,':',2)::int

function log(msg) {
  console.log(`[VALIDAR ${new Date().toISOString()}] ${msg}`);
}

function fmtSec(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  log('Conectado ao banco. Iniciando Fase 1...');

  const report = [];
  let totalFlagged = 0;

  // ── 1. Resetar flags anteriores desta fase (re-run seguro) ────────────────
  log('Resetando flags anteriores desta fase...');
  const reset = await client.query(`
    UPDATE "Result" SET flagged = false, "flagReason" = NULL
    WHERE "flagReason" IN ('pace_muito_rapido','pace_muito_lento','tempo_zero','dns_dnf','pace_nulo')
  `);
  log(`  ${reset.rowCount} flags anteriores resetados`);

  // ── 2. Flags de pace por distância ───────────────────────────────────────
  for (const [dist, { min, max }] of Object.entries(LIMITES)) {
    const distNorm = `replace(upper(distance),'KM','K')`;

    // pace muito rápido (abaixo do mínimo humano)
    const fast = await client.query(`
      UPDATE "Result"
      SET flagged = true, "flagReason" = 'pace_muito_rapido'
      WHERE ${distNorm} = $1
        AND pace IS NOT NULL AND pace != ''
        AND pace ~ '^[0-9]+:[0-9]{2}$'
        AND (SPLIT_PART(pace,':',1)::int * 60 + SPLIT_PART(pace,':',2)::int) < $2
        AND (flagged IS NULL OR flagged = false)
    `, [dist, min]);

    // pace muito lento (acima do máximo razoável)
    const slow = await client.query(`
      UPDATE "Result"
      SET flagged = true, "flagReason" = 'pace_muito_lento'
      WHERE ${distNorm} = $1
        AND pace IS NOT NULL AND pace != ''
        AND pace ~ '^[0-9]+:[0-9]{2}$'
        AND (SPLIT_PART(pace,':',1)::int * 60 + SPLIT_PART(pace,':',2)::int) > $2
        AND (flagged IS NULL OR flagged = false)
    `, [dist, max]);

    const n = fast.rowCount + slow.rowCount;
    totalFlagged += n;
    log(`  ${dist}: +${fast.rowCount} muito_rapido (<${fmtSec(min)}/km) | +${slow.rowCount} muito_lento (>${fmtSec(max)}/km)`);
    report.push({ dist, fast: fast.rowCount, slow: slow.rowCount });
  }

  // ── 3. Tempo zero ─────────────────────────────────────────────────────────
  const zero = await client.query(`
    UPDATE "Result"
    SET flagged = true, "flagReason" = 'tempo_zero'
    WHERE time = '00:00:00'
      AND (flagged IS NULL OR flagged = false)
  `);
  totalFlagged += zero.rowCount;
  log(`  tempo_zero: +${zero.rowCount}`);

  // ── 4. DNS / DNF ──────────────────────────────────────────────────────────
  const dns = await client.query(`
    UPDATE "Result"
    SET flagged = true, "flagReason" = 'dns_dnf'
    WHERE upper(trim(time)) IN ('DNS','DNF','DSQ','NF','NC','AB')
      AND (flagged IS NULL OR flagged = false)
  `);
  totalFlagged += dns.rowCount;
  log(`  dns_dnf: +${dns.rowCount}`);

  // ── 5. Pace nulo/vazio com tempo válido ──────────────────────────────────
  const paceNull = await client.query(`
    UPDATE "Result"
    SET flagged = true, "flagReason" = 'pace_nulo'
    WHERE (pace IS NULL OR pace = '')
      AND time IS NOT NULL AND time != '' AND time != '00:00:00'
      AND upper(trim(time)) NOT IN ('DNS','DNF','DSQ','NF','NC','AB')
      AND (flagged IS NULL OR flagged = false)
  `);
  totalFlagged += paceNull.rowCount;
  log(`  pace_nulo: +${paceNull.rowCount}`);

  // ── 6. Relatório final ────────────────────────────────────────────────────
  log('\n=== CONTAGEM FINAL POR flagReason ===');
  const summary = await client.query(`
    SELECT "flagReason", COUNT(*) as total
    FROM "Result"
    WHERE flagged = true
    GROUP BY "flagReason"
    ORDER BY 2 DESC
  `);

  const totalRow = await client.query('SELECT COUNT(*) FROM "Result"');
  const flaggedRow = await client.query('SELECT COUNT(*) FROM "Result" WHERE flagged = true');
  const total = parseInt(totalRow.rows[0].count);
  const flaggedTotal = parseInt(flaggedRow.rows[0].count);
  const pct = ((flaggedTotal / total) * 100).toFixed(2);

  summary.rows.forEach(r => {
    log(`  ${r.flagReason}: ${Number(r.total).toLocaleString('pt-BR')}`);
  });
  log(`\n  TOTAL FLAGGEADOS: ${flaggedTotal.toLocaleString('pt-BR')} / ${total.toLocaleString('pt-BR')} (${pct}%)`);

  // ── 7. Salvar relatório Markdown ──────────────────────────────────────────
  const reportDir = path.join(process.env.HOME, 'pace-corridas-backend/cerebro/agentes/auditor');
  fs.mkdirSync(reportDir, { recursive: true });

  const ts = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const lines = [
    `# 📋 Relatório Validação — Fase 1`,
    `> Gerado em: ${ts}`,
    `> Total resultados: ${total.toLocaleString('pt-BR')}`,
    `> Total flaggeados: **${flaggedTotal.toLocaleString('pt-BR')} (${pct}%)**`,
    '',
    '## Por Categoria',
    '',
    '| flagReason | Qtd |',
    '|------------|-----|',
    ...summary.rows.map(r => `| \`${r.flagReason}\` | ${Number(r.total).toLocaleString('pt-BR')} |`),
    '',
    '## Por Distância (pace inválido)',
    '',
    '| Distância | Muito rápido | Muito lento | Total |',
    '|-----------|-------------|-------------|-------|',
    ...report.map(r => `| ${r.dist} | ${r.fast.toLocaleString('pt-BR')} | ${r.slow.toLocaleString('pt-BR')} | ${(r.fast + r.slow).toLocaleString('pt-BR')} |`),
    '',
    '## Limites Aplicados',
    '',
    '| Distância | Pace mín | Pace máx |',
    '|-----------|----------|----------|',
    ...Object.entries(LIMITES).map(([d, { min, max }]) => `| ${d} | ${fmtSec(min)}/km | ${fmtSec(max)}/km |`),
    '',
    '---',
    '_Gerado por scripts/validar-resultados.cjs — Fase 1 Qualidade de Dados_',
  ];

  fs.writeFileSync(path.join(reportDir, 'relatorio-validacao-fase1.md'), lines.join('\n'));
  log(`\n✅ Relatório salvo em cerebro/agentes/auditor/relatorio-validacao-fase1.md`);

  await client.end();
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
