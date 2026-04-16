'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./qa-config.cjs');

// ─── helpers ──────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function fmtTs(iso) {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function statusIcon(ok) { return ok ? '✅' : '❌'; }

function loadIcon(ms, threshold) {
  if (!ms) return '❓';
  if (ms <= threshold * 0.5) return '⚡';
  if (ms <= threshold) return '✅';
  if (ms <= threshold * 1.5) return '⚠️';
  return '🔴';
}

function diffLabel(diff) {
  if (!diff) return 'N/A';
  if (diff.isNew) return '🆕 baseline';
  const pct = (diff.ratio * 100).toFixed(1);
  if (diff.ratio < 0.01) return `✅ ${pct}%`;
  if (diff.ratio < 0.05) return `⚠️ ${pct}%`;
  return `🔴 ${pct}%`;
}

function nextTicketId(ticketsDir) {
  ensureDir(ticketsDir);
  const files = fs.readdirSync(ticketsDir).filter(f => f.match(/^QA-\d+\.md$/));
  if (files.length === 0) return 'QA-001';
  const nums = files.map(f => parseInt(f.replace('QA-', '').replace('.md', '')));
  const max = Math.max(...nums);
  return `QA-${String(max + 1).padStart(3, '0')}`;
}

function loadExistingTickets(ticketsDir) {
  ensureDir(ticketsDir);
  const files = fs.readdirSync(ticketsDir).filter(f => f.match(/^QA-\d+\.md$/));
  const tickets = {};
  for (const f of files) {
    const content = fs.readFileSync(path.join(ticketsDir, f), 'utf8');
    // Extract fingerprint from ticket
    const m = content.match(/\*\*Fingerprint:\*\* `([^`]+)`/);
    if (m) tickets[m[1]] = f.replace('.md', '');
  }
  return tickets;
}

function bugFingerprint(pageName, detail) {
  return `${pageName}::${detail}`.toLowerCase().replace(/\s+/g, '_').substring(0, 80);
}

// ─── dashboard ────────────────────────────────────────────────────────────────

function buildDashboard(results, score, passed, total, openTickets) {
  const ts = fmtTs(results.timestamp);
  const th = config.performanceThresholds;

  // Page table
  const pageRows = results.pages.map(p => {
    const checksOk = p.checks.filter(c => c.ok).length;
    const checksTotal = p.checks.length;
    const jsErrors = p.consoleErrors.filter(e => e.type === 'error').length;
    const load = p.loadMs ? `${p.loadMs}ms ${loadIcon(p.loadMs, th.maxLoadTimeMs)}` : '❌ falhou';
    const checksLabel = `${checksOk}/${checksTotal} ${checksOk === checksTotal ? '✅' : '⚠️'}`;
    const jsLabel = jsErrors === 0 ? '0 ✅' : `${jsErrors} ❌`;
    return `| ${p.name} | ${load} | ${checksLabel} | ${jsLabel} | ${diffLabel(p.screenshotDiff)} |`;
  }).join('\n');

  // API table
  const apiRows = results.apis.map(a => {
    const statusLabel = `${a.status} ${statusIcon(a.ok)}`;
    const timeLabel = `${a.ms}ms ${loadIcon(a.ms, th.maxApiTimeMs)}`;
    return `| \`${a.path}\` | ${statusLabel} | ${timeLabel} |`;
  }).join('\n');

  // Open tickets summary
  const ticketList = openTickets.length > 0
    ? openTickets.map(t => `- [${t.id}] ${t.summary}`).join('\n')
    : '_Nenhum bug aberto_ ✅';

  const healthBar = score >= 90 ? '🟢' : score >= 70 ? '🟡' : '🔴';

  return `# 🎨 AGENTE-QA Dashboard
> Última execução: ${ts}
> Saúde geral: ${healthBar} **${score}%** (${passed}/${total} checks) — ${results.durationMs}ms

## Status por Página
| Página | Load | Checks | Erros JS | Screenshot |
|--------|------|--------|----------|------------|
${pageRows}

## APIs
| Endpoint | Status | Tempo |
|----------|--------|-------|
${apiRows}

## Bugs Abertos
${ticketList}

---
_Atualizado automaticamente pelo AGENTE-QA_
`;
}

// ─── full report ──────────────────────────────────────────────────────────────

function buildFullReport(results) {
  const ts = fmtTs(results.timestamp);
  const lines = [`# 📋 Relatório Completo QA — ${ts}`, ''];

  for (const p of results.pages) {
    lines.push(`## ${p.name} (\`${p.path}\`)`);
    lines.push(`- **URL:** ${p.url}`);
    lines.push(`- **Load:** ${p.loadMs ?? 'ERRO'}ms`);
    lines.push(`- **Screenshot diff:** ${diffLabel(p.screenshotDiff)}`);
    if (p.error) lines.push(`- **ERRO:** ${p.error}`);
    lines.push('');
    lines.push('### Checks');
    for (const c of p.checks) {
      lines.push(`- ${statusIcon(c.ok)} \`${c.check.type}\` — ${c.detail}`);
    }
    const jsErrs = p.consoleErrors.filter(e => e.type === 'error');
    if (jsErrs.length > 0) {
      lines.push('');
      lines.push('### Erros de Console JS');
      jsErrs.forEach(e => lines.push(`- \`${e.text}\``));
    }
    lines.push('');
  }

  lines.push('## APIs');
  for (const a of results.apis) {
    lines.push(`- ${statusIcon(a.ok)} \`${a.method} ${a.path}\` → HTTP ${a.status} (${a.ms}ms)${a.error ? ' — ' + a.error : ''}`);
  }

  return lines.join('\n');
}

// ─── ticket ───────────────────────────────────────────────────────────────────

function buildTicket(id, page, checkResult, ts) {
  const fp = bugFingerprint(page.name, checkResult.detail);
  return `# ${id} — Bug QA: ${page.name}
**Data:** ${fmtTs(ts)}
**Página:** ${page.name} (\`${page.url}\`)
**Check:** \`${checkResult.check.type}\`
**Detalhe:** ${checkResult.detail}
**Fingerprint:** \`${fp}\`
**Status:** 🔴 Aberto

## Passos para reproduzir
1. Acessar ${page.url}
2. Verificar: ${checkResult.detail}

## Notas
_Adicionar contexto aqui_
`;
}

// ─── main export ──────────────────────────────────────────────────────────────

function generateReport(results) {
  const cerebroDir = config.cerebroDir;
  const ticketsDir = path.join(cerebroDir, 'tickets');
  ensureDir(cerebroDir);
  ensureDir(ticketsDir);

  // Compute score
  const allChecks = results.pages.flatMap(p => p.checks);
  const apiChecks = results.apis.map(a => ({ ok: a.ok }));
  const allItems = [...allChecks, ...apiChecks];
  const passed = allItems.filter(c => c.ok).length;
  const total = allItems.length;
  const score = total > 0 ? Math.round((passed / total) * 100) : 0;

  // Load existing tickets to avoid duplicates
  const existingTickets = loadExistingTickets(ticketsDir);
  const openTickets = [];

  // Populate open tickets from existing files
  const ticketFiles = fs.readdirSync(ticketsDir).filter(f => f.match(/^QA-\d+\.md$/));
  for (const f of ticketFiles) {
    const content = fs.readFileSync(path.join(ticketsDir, f), 'utf8');
    if (content.includes('🔴 Aberto')) {
      const titleMatch = content.match(/^# (QA-\d+) — Bug QA: (.+)$/m);
      const detailMatch = content.match(/\*\*Detalhe:\*\* (.+)$/m);
      if (titleMatch) {
        openTickets.push({
          id: titleMatch[1],
          summary: detailMatch ? detailMatch[1].trim().substring(0, 80) : titleMatch[2]
        });
      }
    }
  }

  // Create tickets for new bugs
  for (const page of results.pages) {
    const failedChecks = page.checks.filter(c => !c.ok);
    for (const fc of failedChecks) {
      const fp = bugFingerprint(page.name, fc.detail);
      if (!existingTickets[fp]) {
        const id = nextTicketId(ticketsDir);
        const ticketPath = path.join(ticketsDir, `${id}.md`);
        fs.writeFileSync(ticketPath, buildTicket(id, page, fc, results.timestamp));
        existingTickets[fp] = id;
        openTickets.push({ id, summary: fc.detail.substring(0, 80) });
        console.log(`  🎫 Ticket criado: ${id} — ${page.name}: ${fc.detail.substring(0, 60)}`);
      }
    }

    // Also flag API check failures
    const apiFailures = page.checks.filter(c => c.check.type === 'api-responds' && !c.ok);
    for (const af of apiFailures) {
      const fp = bugFingerprint(page.name, af.detail);
      if (!existingTickets[fp]) {
        const id = nextTicketId(ticketsDir);
        const ticketPath = path.join(ticketsDir, `${id}.md`);
        fs.writeFileSync(ticketPath, buildTicket(id, page, af, results.timestamp));
        existingTickets[fp] = id;
        openTickets.push({ id, summary: af.detail.substring(0, 80) });
        console.log(`  🎫 Ticket criado: ${id} — API: ${af.detail.substring(0, 60)}`);
      }
    }
  }

  // API check failures
  for (const api of results.apis.filter(a => !a.ok)) {
    const fakePage = { name: 'API', url: config.baseUrl + api.path };
    const fakeCheck = { check: { type: 'api-responds' }, ok: false, detail: `${api.method} ${api.path} → HTTP ${api.status}${api.error ? ' — ' + api.error : ''}` };
    const fp = bugFingerprint('API', fakeCheck.detail);
    if (!existingTickets[fp]) {
      const id = nextTicketId(ticketsDir);
      const ticketPath = path.join(ticketsDir, `${id}.md`);
      fs.writeFileSync(ticketPath, buildTicket(id, fakePage, fakeCheck, results.timestamp));
      existingTickets[fp] = id;
      openTickets.push({ id, summary: fakeCheck.detail.substring(0, 80) });
      console.log(`  🎫 Ticket criado: ${id} — API: ${fakeCheck.detail.substring(0, 60)}`);
    }
  }

  // Write dashboard
  const dashboard = buildDashboard(results, score, passed, total, openTickets);
  fs.writeFileSync(path.join(cerebroDir, 'dashboard.md'), dashboard);

  // Write full report
  const fullReport = buildFullReport(results);
  fs.writeFileSync(path.join(cerebroDir, 'ultimo-relatorio.md'), fullReport);

  console.log(`  📊 Dashboard: ${path.join(cerebroDir, 'dashboard.md')}`);
  console.log(`  📄 Relatório: ${path.join(cerebroDir, 'ultimo-relatorio.md')}`);
  console.log(`  🎫 Tickets abertos: ${openTickets.length}`);
}

module.exports = { generateReport };
