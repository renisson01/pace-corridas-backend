#!/usr/bin/env node
/**
 * REGENI — Scraper ChipTiming BULK
 * Coleta todos os 6699 eventos via admin.chiptiming.com.br/api/v2
 *
 * Fluxo:
 *   1. Busca todos os eventos da admin API (6699, 50/página)
 *   2. Para cada evento: busca HTML da página → __NEXT_DATA__ → result lists
 *   3. Para cada lista: pagina entries via admin API
 *   4. Importa no banco
 *
 * Uso:
 *   node scripts/scraper-chiptiming-bulk.cjs
 *   node scripts/scraper-chiptiming-bulk.cjs --dry-run
 *   node scripts/scraper-chiptiming-bulk.cjs --start 200   (retomar do evento 200)
 *   node scripts/scraper-chiptiming-bulk.cjs --limit 50
 */
const { Client } = require('pg');
const https = require('https');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL não definida'); process.exit(1); }

const args = process.argv.slice(2);
const getArg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const DRY_RUN = args.includes('--dry-run');
const START = parseInt(getArg('--start') || '0');
const LIMIT = parseInt(getArg('--limit') || '99999');
const DELAY = ms => new Promise(r => setTimeout(r, ms));

const BEARER = 'Bearer JgECf44XYsLdNY57m6K9WbLM62GNJhv6HbJ5AgRE6GfOrr0w4xhEiF3Cok0j8Xrz';
const ADMIN = 'https://admin.chiptiming.com.br/api/v2';
const FRONT = 'https://eventos.chiptiming.com.br';
const TODAY = new Date().toISOString().slice(0, 10);

// ─── HTTP ─────────────────────────────────────────────────────────────────────
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const req = https.get({
      hostname: opts.hostname,
      path: opts.pathname + opts.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 Chrome/120',
        'Accept': 'application/json, text/html, */*',
        ...headers,
      },
      timeout: 30000,
    }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        const loc = res.headers.location.startsWith('http')
          ? res.headers.location
          : `${opts.protocol}//${opts.hostname}${res.headers.location}`;
        return httpsGet(loc, headers).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function apiGet(path) {
  const { status, body } = await httpsGet(ADMIN + path, { Authorization: BEARER });
  if (status !== 200) throw new Error(`HTTP ${status}`);
  return JSON.parse(body);
}

async function htmlGet(url) {
  const { status, body } = await httpsGet(url);
  if (status === 404) return null;
  if (status !== 200) throw new Error(`HTTP ${status}`);
  return body;
}

// ─── Parse __NEXT_DATA__ do HTML do evento ────────────────────────────────────
function parseNextData(html) {
  if (!html) return null;
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[1]);
    return obj?.props?.pageProps || null;
  } catch { return null; }
}

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
  const p = String(t).split(':');
  if (p.length === 3) {
    const h = parseInt(p[0]), m = parseInt(p[1]), s = Math.floor(parseFloat(p[2]));
    if (isNaN(h) || isNaN(m) || isNaN(s) || (!h && !m && !s)) return null;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
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

// ─── Buscar todos eventos da admin API ────────────────────────────────────────
async function fetchAllEvents() {
  const allEvents = [];
  let page = 0;
  process.stdout.write('Coletando lista de eventos da API admin');
  while (true) {
    const data = await apiGet(`/events?pageSize=50&startPage=${page}`);
    const entries = data.entries || [];
    if (!entries.length) break;
    allEvents.push(...entries);
    process.stdout.write('.');
    if (allEvents.length >= data.totalCount) break;
    page++;
    await DELAY(200);
  }
  console.log(` ${allEvents.length} eventos encontrados`);
  return allEvents;
}

// ─── Buscar result lists do evento via HTML ───────────────────────────────────
async function fetchResultLists(event) {
  const year = event.date.substring(0, 4);
  const url = `${FRONT}/resultados/${year}/${event.slug}`;
  const html = await htmlGet(url);
  const pp = parseNextData(html);
  if (!pp) return [];
  const lists = (pp.results || []).filter(l => !l.isFile && l.showLists);
  return lists;
}

// ─── Buscar todas as entries de uma lista via admin API ───────────────────────
async function fetchListEntries(eventCode, listId, totalHint) {
  const all = [];
  let page = 0;
  while (true) {
    const data = await apiGet(`/events/${eventCode}/results/${listId}/entries?pageSize=50&startPage=${page}`);
    const entries = data.entries || [];
    if (!entries.length) break;
    all.push(...entries);
    const total = data.totalCount || totalHint || 9999;
    if (all.length >= total) break;
    page++;
    await DELAY(200);
  }
  return all;
}

// ─── Importar evento no banco ─────────────────────────────────────────────────
async function importEvent(db, event, allData) {
  // allData = [ { entries[], dist, mod }, ... ]
  const todos = [];
  const distSet = new Set();
  for (const d of allData) {
    if (!d.entries.length) continue;
    distSet.add(d.dist);
    const km = distKm(d.dist);
    for (const entry of d.entries) {
      const name = (entry.name || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 200);
      if (!name || name.length < 2) continue;
      const time = fmtTime(entry.netTime || entry.time);
      if (!time) continue;
      todos.push({
        name,
        gender: entry.gender === 'F' ? 'F' : entry.gender === 'M' ? 'M' : null,
        time,
        pace: entry.pace || calcPace(time, km),
        dist: d.dist,
        age: entry.age || null,
        ageGroup: entry.ageGroup || null,
        overallRank: entry.place || null,
      });
    }
  }
  if (!todos.length) return 0;

  const nome = event.officialName || event.slug;
  const city = event.city || '';
  const state = event.state || 'BR';
  const date = event.date.slice(0, 10);
  const distStr = [...distSet].join(',') || '5K';

  // Verificar duplicata
  const ex = await db.query(
    'SELECT id FROM "Race" WHERE name ILIKE $1 AND organizer=\'ChipTiming\' LIMIT 1',
    ['%' + nome.slice(0, 20).replace(/%/g, '') + '%']
  );
  let raceId;
  if (ex.rows.length) {
    raceId = ex.rows[0].id;
    const chk = await db.query('SELECT COUNT(*) c FROM "Result" WHERE "raceId"=$1', [raceId]);
    if (parseInt(chk.rows[0].c) > 0) return -1; // já importado
    await db.query('UPDATE "Race" SET distances=$1 WHERE id=$2', [distStr, raceId]);
  } else {
    raceId = `ct_${Date.now().toString(36)}`;
    await db.query(
      'INSERT INTO "Race"(id,name,city,state,date,distances,organizer,status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())',
      [raceId, nome.slice(0, 200), city, state, date, distStr, 'ChipTiming', 'completed']
    );
  }

  // Inserir atletas em lotes de 200
  for (let i = 0; i < todos.length; i += 200) {
    const chunk = todos.slice(i, i + 200);
    const vals = chunk.map((a, j) => {
      const id = `ct_${(Date.now() + i + j).toString(36)}${j}`;
      const g = a.gender ? `'${a.gender}'` : 'NULL';
      const ag = a.age ? parseInt(a.age) : 'NULL';
      return `('${id}','${esc(a.name)}',${g},'${state}',${ag},NULL,1,0,NOW(),NOW())`;
    });
    await db.query(
      'INSERT INTO "Athlete"(id,name,gender,state,age,"birthDate","totalRaces","totalPoints","createdAt","updatedAt") VALUES ' +
      vals.join(',') + ' ON CONFLICT DO NOTHING'
    );
  }

  // Buscar IDs
  const names = [...new Set(todos.map(a => a.name))];
  const athleteMap = {};
  for (let i = 0; i < names.length; i += 200) {
    const chunk = names.slice(i, i + 200);
    const ph = chunk.map((_, j) => `$${j + 1}`).join(',');
    const rows = await db.query(`SELECT id,name FROM "Athlete" WHERE name IN (${ph})`, chunk);
    for (const r of rows.rows) athleteMap[r.name] = r.id;
  }

  // Inserir resultados em lotes de 200
  let imported = 0;
  for (let i = 0; i < todos.length; i += 200) {
    const chunk = todos.slice(i, i + 200);
    const vals = [];
    for (const a of chunk) {
      const aid = athleteMap[a.name];
      if (!aid) continue;
      const id = `ctr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const pace = a.pace ? `'${esc(a.pace)}'` : 'NULL';
      const ag = a.ageGroup ? `'${esc(a.ageGroup)}'` : 'NULL';
      const or_ = a.overallRank || 'NULL';
      vals.push(`('${id}','${aid}','${raceId}','${a.time}',${pace},'${a.dist}',${ag},${or_},NULL,0,NOW())`);
    }
    if (!vals.length) continue;
    try {
      await db.query(
        'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt") VALUES ' +
        vals.join(',') + ' ON CONFLICT DO NOTHING'
      );
      imported += vals.length;
    } catch (e) {
      for (const a of chunk) {
        const aid = athleteMap[a.name];
        if (!aid) continue;
        const id = `ctr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
        try {
          await db.query(
            'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NULL,0,NOW()) ON CONFLICT DO NOTHING',
            [id, aid, raceId, a.time, a.pace, a.dist, a.ageGroup, a.overallRank]
          );
          imported++;
        } catch (_) {}
      }
    }
  }
  return imported;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== REGENI Scraper ChipTiming BULK ===');
  if (DRY_RUN) console.log('(DRY RUN)');
  console.log(`START=${START} LIMIT=${LIMIT}\n`);

  const db = new Client({ connectionString: DB_URL });
  await db.connect();

  // 1. Buscar todos eventos
  const allEvents = await fetchAllEvents();

  // Filtrar: pular futuros, aplicar start/limit
  const toProcess = allEvents
    .filter(e => e.date.slice(0, 10) <= TODAY)  // apenas passados
    .slice(START, START + LIMIT);

  console.log(`${toProcess.length} eventos para processar (de ${allEvents.length} total)\n`);

  let totalImported = 0, totalSkip = 0, totalNew = 0, totalNoLists = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const event = toProcess[i];
    const idx = START + i;
    const name = (event.officialName || event.slug).slice(0, 35).padEnd(35);
    process.stdout.write(`\n[${idx + 1}/${allEvents.length}] ${name} ${event.date.slice(0, 10)} ${event.state}`);

    try {
      // Verificar duplicata rápida antes de fazer requests
      const exChk = await db.query(
        'SELECT id FROM "Race" WHERE name ILIKE $1 AND organizer=\'ChipTiming\' LIMIT 1',
        ['%' + (event.officialName || event.slug).slice(0, 20).replace(/%/g, '') + '%']
      );
      if (exChk.rows.length) {
        const raceId = exChk.rows[0].id;
        const resChk = await db.query('SELECT COUNT(*) c FROM "Result" WHERE "raceId"=$1', [raceId]);
        if (parseInt(resChk.rows[0].c) > 0) {
          process.stdout.write(' JÁ');
          totalSkip++;
          continue;
        }
      }

      await DELAY(500);

      // Buscar result lists via HTML
      let lists;
      try {
        lists = await fetchResultLists(event);
      } catch (e) {
        process.stdout.write(` html-erro:${e.message.slice(0, 30)}`);
        totalNoLists++;
        continue;
      }

      if (!lists.length) {
        process.stdout.write(' sem-listas');
        totalNoLists++;
        continue;
      }

      process.stdout.write(` [${lists.length}listas]`);
      if (DRY_RUN) continue;

      // Buscar entries de cada lista
      const allData = [];
      for (const lista of lists) {
        const dist = normDist(lista.modality?.distance || 5);
        try {
          await DELAY(300);
          const entries = await fetchListEntries(event.code, lista.id);
          process.stdout.write(` ${dist}:${entries.length}`);
          allData.push({ entries, dist, mod: lista.modality?.code || '?' });
        } catch (e) {
          process.stdout.write(` ${dist}:ERRO`);
        }
      }

      const n = await importEvent(db, event, allData);
      if (n === -1) {
        process.stdout.write(' JÁ');
        totalSkip++;
      } else if (n === 0) {
        process.stdout.write(' 0imp');
        totalNoLists++;
      } else {
        process.stdout.write(` → ${n}imp`);
        totalImported += n;
        totalNew++;
      }

    } catch (e) {
      process.stdout.write(` ERRO:${e.message.slice(0, 50)}`);
    }
  }

  console.log('\n\n' + '='.repeat(60));
  console.log(`CHIPTIMING BULK — ${totalImported} resultados importados`);
  console.log(`                  ${totalNew} novos eventos`);
  console.log(`                  ${totalSkip} pulados (já existiam)`);
  console.log(`                  ${totalNoLists} sem listas/resultados`);

  const r = await db.query('SELECT (SELECT COUNT(*) FROM "Race") c,(SELECT COUNT(*) FROM "Result") res,(SELECT COUNT(*) FROM "Athlete") a');
  console.log(`Banco: ${r.rows[0].c} corridas | ${r.rows[0].res} resultados | ${r.rows[0].a} atletas`);
  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
