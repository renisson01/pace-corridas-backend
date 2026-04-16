#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const config = require('./qa-config.cjs');
const reporter = require('./qa-report.cjs');

const ONCE = process.argv.includes('--once');
const VERBOSE = process.argv.includes('--verbose');

// ─── utils ────────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[QA ${new Date().toISOString()}] ${msg}`); }

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function httpGet(url, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({
        status: res.statusCode,
        body,
        ms: Date.now() - start,
        ok: res.statusCode >= 200 && res.statusCode < 400
      }));
    });
    req.on('error', (e) => resolve({ status: 0, body: '', ms: Date.now() - start, ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', ms: timeoutMs, ok: false, error: 'timeout' }); });
  });
}

function pixelDiff(buf1, buf2) {
  // Simple byte-level diff — rough but dependency-free
  if (!buf1 || !buf2) return 1.0;
  const len = Math.min(buf1.length, buf2.length);
  if (len === 0) return 1.0;
  let diff = Math.abs(buf1.length - buf2.length);
  for (let i = 0; i < len; i++) if (buf1[i] !== buf2[i]) diff++;
  return diff / Math.max(buf1.length, buf2.length);
}

// ─── playwright check ─────────────────────────────────────────────────────────

async function getPlaywright() {
  try {
    return require('playwright');
  } catch {
    console.error('❌ Playwright não instalado. Execute: bash scripts/agente-qa/install.sh');
    process.exit(1);
  }
}

// ─── page checks ──────────────────────────────────────────────────────────────

async function runChecks(page, checks, consoleErrors, baseUrl) {
  const results = [];
  for (const check of checks) {
    try {
      switch (check.type) {
        case 'text-exists': {
          const text = await page.$eval(check.selector, el => el.innerText).catch(() => '');
          const ok = text.toLowerCase().includes(check.text.toLowerCase());
          results.push({ check, ok, detail: ok ? `"${check.text}" encontrado` : `"${check.text}" NÃO encontrado no ${check.selector}` });
          break;
        }
        case 'element-visible': {
          const el = await page.$(check.selector);
          const visible = el ? await el.isVisible().catch(() => false) : false;
          results.push({ check, ok: visible, detail: visible ? `${check.selector} visível` : `${check.selector} NÃO encontrado/visível` });
          break;
        }
        case 'element-count-min': {
          const els = await page.$$(check.selector);
          const ok = els.length >= check.min;
          results.push({ check, ok, detail: `${check.selector}: ${els.length} elementos (mín: ${check.min})` });
          break;
        }
        case 'no-console-errors': {
          const errors = consoleErrors.filter(e => e.type === 'error');
          const ok = errors.length === 0;
          results.push({ check, ok, detail: ok ? 'Sem erros de console' : `${errors.length} erro(s): ${errors.map(e => e.text).slice(0, 3).join(' | ')}` });
          break;
        }
        case 'api-responds': {
          const url = baseUrl + check.url;
          const res = await httpGet(url, 8000);
          const ok = res.status === (check.expectStatus || 200);
          results.push({ check, ok, detail: `${check.url} → HTTP ${res.status} (${res.ms}ms)` });
          break;
        }
        default:
          results.push({ check, ok: false, detail: `check type desconhecido: ${check.type}` });
      }
    } catch (e) {
      results.push({ check, ok: false, detail: `EXCEPTION: ${e.message}` });
    }
  }
  return results;
}

// ─── test one page ────────────────────────────────────────────────────────────

async function testPage(browser, pageDef) {
  const url = config.baseUrl + pageDef.path;
  const screenshotPath = path.join(config.screenshotsDir, `${pageDef.id}.png`);
  const baselinePath = path.join(config.screenshotsDir, 'baseline', `${pageDef.id}.png`);
  const result = {
    id: pageDef.id,
    name: pageDef.name,
    url,
    loadMs: null,
    checks: [],
    consoleErrors: [],
    screenshotPath,
    screenshotDiff: null,
    error: null,
  };

  const context = await browser.newContext({
    viewport: config.viewport,
    userAgent: config.userAgent,
  });
  const page = await context.newPage();
  const consoleErrors = [];

  page.on('console', msg => {
    if (VERBOSE) log(`  [console:${msg.type()}] ${msg.text()}`);
    consoleErrors.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', err => {
    consoleErrors.push({ type: 'error', text: err.message });
  });

  try {
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeout });
    // wait a bit for JS to settle
    await page.waitForTimeout(1500);
    result.loadMs = Date.now() - t0;

    result.consoleErrors = consoleErrors;
    result.checks = await runChecks(page, pageDef.checks, consoleErrors, config.baseUrl);

    // screenshot
    ensureDir(config.screenshotsDir);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // baseline compare
    const baselineDir = path.join(config.screenshotsDir, 'baseline');
    if (!fs.existsSync(baselinePath)) {
      ensureDir(baselineDir);
      fs.copyFileSync(screenshotPath, baselinePath);
      result.screenshotDiff = { ratio: 0, isNew: true };
      log(`  📸 Baseline criado para ${pageDef.id}`);
    } else {
      const current = fs.readFileSync(screenshotPath);
      const baseline = fs.readFileSync(baselinePath);
      const ratio = pixelDiff(current, baseline);
      result.screenshotDiff = { ratio, isNew: false };
    }
  } catch (e) {
    result.error = e.message;
    log(`  ❌ Erro em ${pageDef.id}: ${e.message}`);
  } finally {
    await context.close();
  }

  return result;
}

// ─── test APIs ────────────────────────────────────────────────────────────────

async function testAPIs() {
  const results = [];
  for (const check of config.apiChecks) {
    const url = config.baseUrl + check.path;
    const res = await httpGet(url, config.performanceThresholds.maxApiTimeMs + 2000);
    let isJson = false;
    if (check.expectJson && res.body) {
      try { JSON.parse(res.body); isJson = true; } catch { isJson = false; }
    }
    const ok = res.status === check.expectStatus && (!check.expectJson || isJson);
    results.push({
      path: check.path,
      method: check.method,
      status: res.status,
      ms: res.ms,
      ok,
      isJson,
      error: res.error || null,
      slow: res.ms > config.performanceThresholds.maxApiTimeMs,
    });
    if (VERBOSE) log(`  API ${check.path} → ${res.status} ${res.ms}ms`);
  }
  return results;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function run() {
  const pw = await getPlaywright();
  log('🚀 AGENTE-QA iniciando...');

  ensureDir(config.screenshotsDir);
  ensureDir(config.cerebroDir);
  ensureDir(path.join(config.cerebroDir, 'tickets'));

  const browser = await pw.chromium.launch({ headless: true });
  const runResults = {
    timestamp: new Date().toISOString(),
    pages: [],
    apis: [],
    durationMs: 0,
  };

  const t0 = Date.now();

  // Test pages
  for (const pageDef of config.pages) {
    log(`🔍 Testando página: ${pageDef.name} (${pageDef.path})`);
    const result = await testPage(browser, pageDef);
    runResults.pages.push(result);
    const passed = result.checks.filter(c => c.ok).length;
    const total = result.checks.length;
    const jsErrors = result.consoleErrors.filter(e => e.type === 'error').length;
    const diffPct = result.screenshotDiff ? (result.screenshotDiff.ratio * 100).toFixed(1) : 'N/A';
    log(`  ✅ ${passed}/${total} checks | ${result.loadMs}ms | JS errors: ${jsErrors} | diff: ${diffPct}%`);
  }

  // Test APIs
  log('📡 Testando APIs...');
  runResults.apis = await testAPIs();
  const apiOk = runResults.apis.filter(a => a.ok).length;
  log(`  ✅ APIs: ${apiOk}/${runResults.apis.length} OK`);

  runResults.durationMs = Date.now() - t0;
  await browser.close();

  // Generate report
  log('📝 Gerando relatório...');
  reporter.generateReport(runResults);

  const allChecks = runResults.pages.flatMap(p => p.checks);
  const totalChecks = allChecks.length + runResults.apis.length;
  const passedChecks = allChecks.filter(c => c.ok).length + apiOk;
  const score = Math.round((passedChecks / totalChecks) * 100);

  log(`\n🎯 RESULTADO FINAL: ${score}% (${passedChecks}/${totalChecks}) — ${runResults.durationMs}ms`);
  log(`📂 Dashboard: ${config.cerebroDir}/dashboard.md`);
}

run().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
