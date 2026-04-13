#!/usr/bin/env node
/**
 * REGENI — Scraper ChipTiming via Puppeteer
 * Usa browser headless para contornar autenticação da API admin.chiptiming.com.br
 *
 * Estratégia:
 *   1. Puppeteer navega para eventos.chiptiming.com.br/{ano}/{slug}
 *   2. Intercepta respostas JSON das chamadas /entries (browser autentica automaticamente)
 *   3. Navega por cada lista de resultado (modalidade × gênero)
 *   4. Coleta dados com paginação
 *   5. Importa no banco PostgreSQL
 *
 * Uso:
 *   node scripts/scraper-chiptiming-puppeteer.cjs --ano 2026 --evento maratonafortaleza2026
 *   node scripts/scraper-chiptiming-puppeteer.cjs --ano 2026 --evento maratonafortaleza2026 --dry-run
 *   node scripts/scraper-chiptiming-puppeteer.cjs --url https://eventos.chiptiming.com.br/resultados/2026/maratonafortaleza2026
 */

const puppeteer = require('puppeteer');
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL não definida'); process.exit(1); }

const DELAY = ms => new Promise(r => setTimeout(r, ms));

// ─── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const ANO   = getArg('--ano') || '2026';
const SLUG  = getArg('--evento');
const URL_ARG = getArg('--url');
const DRY_RUN = args.includes('--dry-run');
const PAGE_SIZE = 200;

if (!SLUG && !URL_ARG) {
  console.error('Uso: node scraper-chiptiming-puppeteer.cjs --ano 2026 --evento maratonafortaleza2026');
  console.error('  ou: node scraper-chiptiming-puppeteer.cjs --url https://eventos.chiptiming.com.br/resultados/2026/maratonafortaleza2026');
  process.exit(1);
}

const EVENT_URL = URL_ARG || `https://eventos.chiptiming.com.br/resultados/${ANO}/${SLUG}`;
const EVENT_SLUG = SLUG || EVENT_URL.split('/').pop();

// ─── Utils ────────────────────────────────────────────────────────────────────
function normDist(d) {
  const n = parseFloat(String(d || '5').replace(/[^0-9.]/g, ''));
  if (n >= 40) return '42K'; if (n >= 20) return '21K'; if (n >= 14) return '15K';
  if (n >= 12) return '12K'; if (n >= 9) return '10K'; if (n >= 7.5) return '8K';
  if (n >= 6.5) return '7K'; if (n >= 5.5) return '6K'; if (n >= 4) return '5K'; return '3K';
}
function distKm(d) {
  return { '42K': 42, '21K': 21, '15K': 15, '12K': 12, '10K': 10, '8K': 8, '7K': 7, '6K': 6, '5K': 5, '3K': 3 }[d] || 5;
}
function fmtTime(t) {
  if (!t) return null;
  // Aceita HH:MM:SS ou MM:SS ou H:MM:SS
  const p = String(t).split(':');
  if (p.length === 3) {
    const h = parseInt(p[0]), m = parseInt(p[1]), s = Math.floor(parseFloat(p[2]));
    if (isNaN(h) || isNaN(m) || isNaN(s)) return null;
    if (!h && !m && !s) return null;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  if (p.length === 2) {
    // MM:SS → 00:MM:SS
    const m = parseInt(p[0]), s = Math.floor(parseFloat(p[1]));
    if (isNaN(m) || isNaN(s)) return null;
    return `00:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  return null;
}
function calcPace(t, km) {
  if (!t || !km) return null;
  const [h, m, s] = t.split(':').map(Number);
  const sec = h * 3600 + m * 60 + s;
  if (!sec) return null;
  const ps = sec / km;
  return `${Math.floor(ps / 60)}:${String(Math.round(ps % 60)).padStart(2,'0')}`;
}
function esc(s) { return String(s || '').replace(/'/g, "''"); }

// ─── Puppeteer: coletar dados ─────────────────────────────────────────────────
async function coletarDados() {
  console.log(`\n=== ChipTiming Puppeteer Scraper ===`);
  console.log(`Evento: ${EVENT_SLUG}`);
  console.log(`URL: ${EVENT_URL}\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 900 });

  // ── Fase 1: Interceptar respostas ANTES de carregar a página ─────────────
  // A API responde com JSON de atletas — capturamos direto do tráfego de rede
  const capturedResponses = {}; // listId → [entries]
  const capturedUrls = new Set();

  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('admin.chiptiming.com.br') && !url.includes('chiptimingstorage')) return;
    if (response.status() !== 200) return;
    const ct = response.headers()['content-type'] || '';
    if (!ct.includes('json')) return;
    try {
      const json = await response.json();
      const entries = json.entries || json.items || json.data || (Array.isArray(json) ? json : null);
      if (entries && entries.length > 0) {
        // Extrair listId da URL (padrão: /results/{listId}/entries)
        const m = url.match(/results\/(\d+)\/entries/);
        const listId = m ? m[1] : url;
        if (!capturedResponses[listId]) capturedResponses[listId] = [];
        capturedResponses[listId].push({ entries, total: json.totalCount || json.total || entries.length, url });
        capturedUrls.add(url);
        process.stdout.write(`\n  Capturado: ${entries.length} entries (${listId})`);
      }
    } catch (_) {}
  });

  // ── Fase 2: Carregar página + metadados ──────────────────────────────────
  console.log('[1/4] Carregando página do evento...');
  try {
    await page.goto(EVENT_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  } catch (e) {
    console.log('  Aviso:', e.message.slice(0, 60));
  }
  await DELAY(3000);

  const nextData = await page.evaluate(() => {
    const el = document.getElementById('__NEXT_DATA__');
    return el ? JSON.parse(el.textContent) : null;
  });

  if (!nextData?.props?.pageProps?.event) {
    console.error('Não foi possível extrair metadados. URL correta?');
    await browser.close();
    return null;
  }

  const eventMeta = nextData.props.pageProps.event;
  const resultLists = (nextData.props.pageProps.results || []).filter(l => !l.isFile && l.showLists);
  const eventCode = eventMeta.code;

  console.log(`  Evento: ${eventMeta.officialName} — ${eventMeta.city}/${eventMeta.state}`);
  console.log(`  Data: ${eventMeta.date?.slice(0, 10)} | eventCode: ${eventCode}`);
  console.log(`  Listas: ${resultLists.length}`);

  // ── Fase 3: Clicar em cada aba/botão de modalidade para disparar API ──────
  console.log('\n[2/4] Interagindo com UI para disparar chamadas de API...');

  // Estratégia A: clicar em botões/links de seleção de resultado
  for (const lista of resultLists) {
    const listId = String(lista.id);
    const mod = lista.modality.code;
    const tipo = lista.type.code;
    process.stdout.write(`\n  → ${mod} / ${tipo}:`);

    // Tenta clicar no botão da lista (por data-id, por texto, ou por link)
    try {
      const clicked = await page.evaluate((lid) => {
        // Procura botão ou link com o ID da lista
        const selectors = [
          `[data-result-id="${lid}"]`,
          `[data-id="${lid}"]`,
          `[href*="${lid}"]`,
          `button[id="${lid}"]`,
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) { el.click(); return sel; }
        }
        return null;
      }, listId);

      if (clicked) {
        process.stdout.write(` clicou(${clicked})`);
        await DELAY(2500);
      } else {
        // Fallback: navega para URL da lista diretamente
        const listUrl = `${EVENT_URL}/lista/${listId}`;
        try {
          await page.goto(listUrl, { waitUntil: 'networkidle2', timeout: 20000 });
          await DELAY(2000);
          // Volta para a página principal
          await page.goto(EVENT_URL, { waitUntil: 'networkidle2', timeout: 20000 });
          await DELAY(1500);
        } catch (_) {}
        process.stdout.write(' sem-botão');
      }
    } catch (e) {
      process.stdout.write(` err:${e.message.slice(0, 30)}`);
    }
  }

  // Aguarda para garantir que todas as respostas foram processadas
  await DELAY(3000);

  // ── Fase 4: Verificar URLs capturadas e tentar paginação ─────────────────
  console.log(`\n\n[3/4] URLs de API capturadas: ${capturedUrls.size}`);
  for (const url of capturedUrls) {
    console.log(`  ${url}`);
  }

  // Para URLs capturadas, verifica se há mais páginas
  const dataMap = {};
  for (const [listId, pages] of Object.entries(capturedResponses)) {
    let allEntries = pages.flatMap(p => p.entries);
    const total = pages[0]?.total || allEntries.length;

    // Se tem mais páginas, busca via fetch de dentro do browser
    if (allEntries.length < total && capturedUrls.size > 0) {
      const baseUrl = pages[0]?.url?.replace(/startPage=\d+/, '').replace(/&?startPage=\d+/, '') || '';
      let startPage = 1;
      while (allEntries.length < total && startPage < 100) {
        const nextUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + `startPage=${startPage}`;
        const result = await page.evaluate(async (url) => {
          try {
            const res = await fetch(url, { credentials: 'include', headers: { 'Accept': 'application/json' } });
            if (!res.ok) return { error: res.status };
            return { ok: true, data: await res.json() };
          } catch (e) { return { error: e.message }; }
        }, nextUrl);
        if (result.error || !result.data) break;
        const more = result.data.entries || result.data.items || (Array.isArray(result.data) ? result.data : []);
        if (!more.length) break;
        allEntries = allEntries.concat(more);
        process.stdout.write(`\r  Paginando ${listId}: ${allEntries.length}/${total}...`);
        startPage++;
        await DELAY(500);
      }
    }

    dataMap[listId] = { entries: allEntries, total };
  }

  // Fallback: se nada capturado, tenta URLs construídas com token Bearer
  if (Object.keys(dataMap).length === 0) {
    console.log('\n  Interceptação vazia — tentando token Bearer hardcoded...');
    const TOKEN = 'Bearer JgECf44XYsLdNY57m6K9WbLM62GNJhv6HbJ5AgRE6GfOrr0w4xhEiF3Cok0j8Xrz';
    for (const lista of resultLists) {
      const listId = String(lista.id);
      const mod = lista.modality.code;
      process.stdout.write(`\n  [${mod}]`);
      const result = await page.evaluate(async (listId, eventCode, token) => {
        const url = `https://admin.chiptiming.com.br/api/v2/events/${eventCode}/results/${listId}/entries?pageSize=200&startPage=0`;
        try {
          const res = await fetch(url, {
            credentials: 'include',
            headers: { 'Accept': 'application/json', 'authorization': token },
          });
          if (!res.ok) return { error: res.status };
          return { ok: true, data: await res.json() };
        } catch (e) { return { error: e.message }; }
      }, listId, eventCode, TOKEN);
      if (result.ok) {
        const entries = result.data.entries || result.data.items || (Array.isArray(result.data) ? result.data : []);
        process.stdout.write(` ${entries.length} entries`);
        if (entries.length) dataMap[listId] = { entries, total: result.data.totalCount || entries.length };
      } else {
        process.stdout.write(` erro:${result.error}`);
      }
    }
  }

  await browser.close();

  console.log(`\n\n[3/4] Resumo da coleta:`);
  let grandTotal = 0;
  for (const [lid, d] of Object.entries(dataMap)) {
    const lista = resultLists.find(l => String(l.id) === lid);
    const mod = lista?.modality?.code || '?';
    const tipo = lista?.type?.code || '?';
    console.log(`  ${mod} / ${tipo}: ${d.entries.length} entries`);
    grandTotal += d.entries.length;
  }
  console.log(`  TOTAL: ${grandTotal} atletas`);

  return { eventMeta, resultLists, dataMap };
}

// ─── Importar para o banco ────────────────────────────────────────────────────
async function importar(db, eventMeta, resultLists, dataMap) {
  const nome = eventMeta.officialName || EVENT_SLUG;
  const date = eventMeta.date ? eventMeta.date.slice(0, 10) : '2026-01-01';
  const city = eventMeta.city || 'Fortaleza';
  const state = eventMeta.state || 'CE';

  // Todas as modalidades únicas
  const distSet = new Set(
    resultLists.map(l => normDist(l.modality.distance || l.modality.code))
  );

  // Verificar se já existe
  const ex = await db.query(
    'SELECT id FROM "Race" WHERE name ILIKE $1 AND organizer=\'ChipTiming\' LIMIT 1',
    ['%' + nome.slice(0, 25) + '%']
  );

  if (ex.rows.length) {
    const chk = await db.query('SELECT COUNT(*) c FROM "Result" WHERE "raceId"=$1', [ex.rows[0].id]);
    if (parseInt(chk.rows[0].c) > 0) {
      console.log(`\nCorrida já importada (${chk.rows[0].c} resultados). Pulando.`);
      return 0;
    }
  }

  let raceId;
  if (ex.rows.length) {
    raceId = ex.rows[0].id;
    await db.query('UPDATE "Race" SET distances=$1 WHERE id=$2', [[...distSet].join(','), raceId]);
  } else {
    raceId = `ct_${Date.now().toString(36)}`;
    await db.query(
      'INSERT INTO "Race"(id,name,city,state,date,distances,organizer,status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())',
      [raceId, nome, city, state, date, [...distSet].join(',') || '5K,10K,21K,42K', 'ChipTiming', 'completed']
    );
    console.log(`\nCorrida criada: ${raceId}`);
  }

  // Montar lista completa de atletas
  const todos = [];
  for (const [listId, d] of Object.entries(dataMap)) {
    const lista = resultLists.find(l => String(l.id) === listId);
    if (!lista) continue;
    const dist = normDist(lista.modality.distance || lista.modality.code);
    const genderCode = lista.type.code.startsWith('Female') ? 'F' : lista.type.code.startsWith('Male') ? 'M' : null;

    for (const entry of d.entries) {
      // Normalizar campos (ChipTiming pode variar os nomes)
      const name = (entry.name || entry.athleteName || entry.nomeatl || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 200);
      if (!name || name.length < 2) continue;
      const rawTime = entry.netTime || entry.time || entry.grossTime || entry.tempoliq || entry.tempo;
      const time = fmtTime(rawTime);
      if (!time) continue;
      const km = distKm(dist);
      todos.push({
        name,
        gender: entry.gender === 'F' ? 'F' : entry.gender === 'M' ? 'M' : genderCode,
        time,
        pace: calcPace(time, km),
        dist,
        km,
        age: entry.age || null,
        ageGroup: entry.ageGroup || entry.categoria || null,
        overallRank: entry.place || entry.generalPlace || null,
        genderRank: entry.genderPlace || null,
        team: entry.team || null,
      });
    }
  }

  console.log(`\n[4/4] Importando ${todos.length} atletas...`);
  if (!todos.length) { console.log('Nenhum atleta válido.'); return 0; }

  // INSERT atletas em lote
  for (let i = 0; i < todos.length; i += 100) {
    const chunk = todos.slice(i, i + 100);
    const vals = chunk.map((a, j) => {
      const id = `ct_${(Date.now() + i + j).toString(36)}${j}`;
      const g = a.gender ? `'${a.gender}'` : 'NULL';
      const ag = a.age || 'NULL';
      return `('${id}','${esc(a.name)}',${g},'${state}',${ag},NULL,1,0,NOW(),NOW())`;
    });
    await db.query(
      'INSERT INTO "Athlete"(id,name,gender,state,age,"birthDate","totalRaces","totalPoints","createdAt","updatedAt") VALUES ' +
      vals.join(',') + ' ON CONFLICT DO NOTHING'
    );
    process.stdout.write(`\r  Atletas: ${Math.min(i + 100, todos.length)}/${todos.length}`);
  }
  console.log('');

  // Buscar IDs dos atletas
  const names = [...new Set(todos.map(a => a.name))];
  const athleteMap = {};
  for (let i = 0; i < names.length; i += 100) {
    const chunk = names.slice(i, i + 100);
    const ph = chunk.map((_, j) => `$${j + 1}`).join(',');
    const rows = await db.query(`SELECT id,name FROM "Athlete" WHERE name IN (${ph})`, chunk);
    for (const r of rows.rows) athleteMap[r.name] = r.id;
  }

  // INSERT resultados
  let imported = 0;
  for (const a of todos) {
    const aid = athleteMap[a.name];
    if (!aid) continue;
    const id = `ctr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    try {
      await db.query(
        'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,0,NOW(),NOW()) ON CONFLICT DO NOTHING',
        [id, aid, raceId, a.time, a.pace, a.dist, a.ageGroup, a.overallRank, a.genderRank]
      );
      imported++;
    } catch (_) {}
    if (imported % 100 === 0) process.stdout.write(`\r  Resultados: ${imported}/${todos.length}`);
  }
  console.log(`\n  Importados: ${imported}/${todos.length}`);

  return imported;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const dados = await coletarDados();
  if (!dados) process.exit(1);

  const { eventMeta, resultLists, dataMap } = dados;
  const grandTotal = Object.values(dataMap).reduce((s, d) => s + d.entries.length, 0);

  if (grandTotal === 0) {
    console.error('\n⚠ Nenhum dado coletado. Possíveis causas:');
    console.error('  - A API mudou os endpoints');
    console.error('  - A URL do evento está incorreta');
    console.error('  - Os resultados ainda não foram publicados');
    console.error('\nTente rodar sem --dry-run ou verificar a URL.');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Dados coletados mas não importados.');
    process.exit(0);
  }

  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  console.log('\nConectado ao banco!');

  const imported = await importar(db, eventMeta, resultLists, dataMap);

  const totais = await db.query('SELECT (SELECT COUNT(*) FROM "Race") c, (SELECT COUNT(*) FROM "Result") res');
  console.log(`\nBanco: ${totais.rows[0].c} corridas | ${totais.rows[0].res} resultados`);

  await db.end();
  console.log(`\n✅ ${imported} resultados importados da Maratona de Fortaleza 2026`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
