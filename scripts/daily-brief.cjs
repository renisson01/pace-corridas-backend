#!/usr/bin/env node
/**
 * REGENI Daily Brief — gera nota diária no Obsidian/cerebro
 * Rodar: node scripts/daily-brief.cjs
 * Cron: 0 7 * * * cd ~/pace-corridas-backend && node scripts/daily-brief.cjs
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:sBbOLYIKlSXCXTnLWnYRUTJVAzLUBhhF@caboose.proxy.rlwy.net:31475/railway';
const VAULT = path.join(__dirname, '../cerebro');

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function ontem() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatNum(n) {
  return Number(n).toLocaleString('pt-BR');
}

async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();

  // ── Dados do banco ────────────────────────────────────────────────
  const totais = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM "Race") as corridas,
      (SELECT COUNT(*) FROM "Athlete") as atletas,
      (SELECT COUNT(*) FROM "Result") as resultados
  `);

  const novosHoje = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM "Race" WHERE "createdAt"::date = $1) as corridas_novas,
      (SELECT COUNT(*) FROM "Athlete" WHERE "createdAt"::date = $1) as atletas_novos,
      (SELECT COUNT(*) FROM "Result" WHERE "createdAt"::date = $1) as resultados_novos
  `, [hoje()]);

  const novosOntem = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM "Result" WHERE "createdAt"::date = $1) as resultados_ontem
  `, [ontem()]);

  const topCorridas = await db.query(`
    SELECT rc.name, COUNT(r.id) as total
    FROM "Result" r
    JOIN "Race" rc ON r."raceId" = rc.id
    WHERE r."createdAt"::date >= $1
    GROUP BY rc.name
    ORDER BY total DESC
    LIMIT 5
  `, [ontem()]);

  const topEstados = await db.query(`
    SELECT state, COUNT(*) as total
    FROM "Athlete"
    WHERE state IS NOT NULL AND state != ''
    GROUP BY state
    ORDER BY total DESC
    LIMIT 5
  `);

  const scrapers = await db.query(`
    SELECT organizer, COUNT(*) as corridas, SUM(sub.total) as resultados
    FROM "Race" rc
    LEFT JOIN (
      SELECT "raceId", COUNT(*) as total FROM "Result" GROUP BY "raceId"
    ) sub ON sub."raceId" = rc.id
    WHERE organizer IS NOT NULL
    GROUP BY organizer
    ORDER BY resultados DESC NULLS LAST
    LIMIT 8
  `);

  await db.end();

  const t = totais.rows[0];
  const n = novosHoje.rows[0];
  const no = novosOntem.rows[0];

  // ── Gerar nota Markdown ───────────────────────────────────────────
  const data = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  let md = `---
date: ${hoje()}
type: daily-brief
tags: [daily, regeni, status]
---

# 📊 REGENI Daily Brief
### ${data}

---

## 🗄️ Banco de Dados

| Métrica | Total | Novos Hoje |
|---------|-------|------------|
| 🏁 Corridas | ${formatNum(t.corridas)} | +${formatNum(n.corridas_novas)} |
| 👤 Atletas | ${formatNum(t.atletas)} | +${formatNum(n.atletas_novos)} |
| 📊 Resultados | ${formatNum(t.resultados)} | +${formatNum(n.resultados_novos)} |

> Ontem foram importados **${formatNum(no.resultados_ontem)}** resultados.

---

## 📥 Fontes de Dados (Scrapers)

| Fonte | Corridas | Resultados |
|-------|----------|------------|
${scrapers.rows.map(r => `| ${r.organizer} | ${formatNum(r.corridas)} | ${formatNum(r.resultados || 0)} |`).join('\n')}

---

## 🏆 Corridas com mais importações recentes

${topCorridas.rows.length > 0
  ? topCorridas.rows.map((r, i) => `${i + 1}. **${r.name}** — ${formatNum(r.total)} resultados`).join('\n')
  : '_Nenhuma corrida nova recente_'}

---

## 🗺️ Top Estados (Atletas)

${topEstados.rows.map((r, i) => `${i + 1}. **${r.state}** — ${formatNum(r.total)} atletas`).join('\n')}

---

## 🚀 Status do Produto

- [ ] Play Store — pendente
- [ ] Frontend polish — em andamento
- [ ] OpenClaw/Bot alternativo — pendente
- [ ] Premium tier — planejado

---

## 📝 Notas do Dia

_Adicione aqui observações, decisões ou tarefas do dia._

---

## 🤖 Agentes

| Agente | Status | Última ação |
|--------|--------|-------------|
| Scraper SportsChrono | ✅ ativo | ${hoje()} |
| Scraper Central v3 | ✅ ativo | ${hoje()} |
| Scraper Race83 | ✅ ativo | ${hoje()} |
| Scraper Contime | ✅ ativo | ${hoje()} |
| OpenClaw (Telegram) | ❌ pausado | — |

---

_Gerado automaticamente por REGENI Daily Brief — ${new Date().toLocaleTimeString('pt-BR')}_
`;

  // ── Salvar no vault ───────────────────────────────────────────────
  const dailyDir = path.join(VAULT, 'daily');
  if (!fs.existsSync(dailyDir)) fs.mkdirSync(dailyDir, { recursive: true });

  const arquivo = path.join(dailyDir, `${hoje()}.md`);
  fs.writeFileSync(arquivo, md, 'utf8');

  console.log(`✅ Daily Brief salvo em: ${arquivo}`);
  console.log(`📊 Banco: ${formatNum(t.corridas)} corridas | ${formatNum(t.atletas)} atletas | ${formatNum(t.resultados)} resultados`);
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
