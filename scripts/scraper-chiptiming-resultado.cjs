#!/usr/bin/env node
/**
 * REGENI — Scraper ChipTiming Resultado (nova plataforma)
 * resultado.chiptiming.com.br — API pública, sem auth
 *
 * Plataforma NOVA (Vue.js) distinta de eventos.chiptiming.com.br (Next.js).
 * Cobre eventos recentes 2026+ (SP, PR, RJ, SC, CE, RN, PE, PA, PB, GO, etc.)
 *
 * API:
 *   GET /api/v1/eventos?limite=200        → lista eventos
 *   GET /api/v1/resultados/{ano}/{slug}?pagina=N&limite=200  → resultados paginados
 *
 * Uso:
 *   node scripts/scraper-chiptiming-resultado.cjs
 *   node scripts/scraper-chiptiming-resultado.cjs --dry-run
 *   node scripts/scraper-chiptiming-resultado.cjs --limit 5
 *   node scripts/scraper-chiptiming-resultado.cjs --evento 30maratonadesp
 */
'use strict';

require('dotenv').config();
const { Client } = require('pg');
const https = require('https');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL não definida'); process.exit(1); }

const args = process.argv.slice(2);
const getArg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const DRY_RUN = args.includes('--dry-run');
const LIMIT   = parseInt(getArg('--limit') || '9999');
const EVENTO  = getArg('--evento');
const DELAY   = ms => new Promise(r => setTimeout(r, ms));

const BASE_API  = 'https://resultado.chiptiming.com.br/api/v1';
const ORGANIZER = 'ChipTiming';
const ID_PREFIX = 'ctr'; // chiptiming-resultado (distinto do ct_ do bulk)
const PAGE_SIZE = 200;

// ─── HTTP ─────────────────────────────────────────────────────────────────────
function get(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 Chrome/120',
        'Accept': 'application/json',
      },
      timeout: 30000,
    }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        const loc = res.headers.location.startsWith('http')
          ? res.headers.location
          : `${u.protocol}//${u.hostname}${res.headers.location}`;
        return get(loc).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ─── Normalizar distância ─────────────────────────────────────────────────────
function normDist(nomeOuKm) {
  const n = parseFloat(String(nomeOuKm || '5').replace(/[^0-9.]/g, ''));
  if (n >= 40) return '42K'; if (n >= 20) return '21K'; if (n >= 14) return '15K';
  if (n >= 12) return '12K'; if (n >= 9)  return '10K'; if (n >= 7.5) return '8K';
  if (n >= 6.5) return '7K'; if (n >= 5.5) return '6K'; if (n >= 4) return '5K'; return '3K';
}

function distKmNum(d) {
  return { '42K':42,'21K':21,'15K':15,'12K':12,'10K':10,'8K':8,'7K':7,'6K':6,'5K':5,'3K':3 }[d] || 5;
}

// Normaliza tempo "HH:MM:SS" → "HH:MM:SS" ou null
function fmtTime(t) {
  if (!t || typeof t !== 'string') return null;
  const p = t.split(':');
  if (p.length !== 3) return null;
  const h = parseInt(p[0]), m = parseInt(p[1]), s = parseInt(p[2]);
  if (isNaN(h) || isNaN(m) || isNaN(s) || (!h && !m && !s)) return null;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// Calcula pace se não fornecido
function calcPace(timeStr, km) {
  if (!timeStr || !km) return null;
  const [h, m, s] = timeStr.split(':').map(Number);
  const sec = h * 3600 + m * 60 + s;
  if (!sec) return null;
  const ps = sec / km;
  return `${Math.floor(ps / 60)}:${String(Math.round(ps % 60)).padStart(2,'0')}`;
}

function esc(s) { return String(s || '').replace(/'/g, "''"); }

// ─── Buscar todos os eventos ───────────────────────────────────────────────────
async function fetchAllEvents() {
  const data = await get(`${BASE_API}/eventos?limite=500`);
  return (data.eventos || []).filter(e => e.status === 'resultados-oficiais');
}

// ─── Buscar resultados de um evento (paginado) ────────────────────────────────
async function fetchResults(slug, ano) {
  const all = [];
  let page = 1;
  let total = null;

  while (true) {
    const data = await get(`${BASE_API}/resultados/${ano}/${slug}?pagina=${page}&limite=${PAGE_SIZE}`);
    if (total === null) total = data.totalItens || 0;
    const batch = data.resultados || [];
    if (!batch.length) break;
    all.push(...batch);
    if (all.length >= total) break;
    page++;
    await DELAY(300);
  }
  return all;
}

// ─── Importar evento ──────────────────────────────────────────────────────────
async function importEvent(db, event, results) {
  if (!results.length) return 0;

  const name = (event.nomeOficial || event.slug)
    .trim().replace(/\s+/g, ' ').slice(0, 200);
  const date = (event.dataInicio || '').slice(0, 10) || '2026-01-01';
  const state = event.estado || 'SP';
  const city  = event.cidade || state;

  // Deduplicação
  const ex = await db.query(
    `SELECT id FROM "Race" WHERE name ILIKE $1 AND organizer=$2 LIMIT 1`,
    ['%' + name.slice(0, 20).replace(/%/g, '') + '%', ORGANIZER]
  );

  let raceId;
  const distSet = new Set(results.map(r => normDist(r.distanciaInfo?.nome || r.distanciaInfo?.distanciaKm || '5')));
  const distStr = [...distSet].join(',') || '5K';

  if (ex.rows.length) {
    raceId = ex.rows[0].id;
    const chk = await db.query('SELECT COUNT(*) c FROM "Result" WHERE "raceId"=$1', [raceId]);
    if (parseInt(chk.rows[0].c) > 0) { process.stdout.write(' JÁ'); return -1; }
  } else {
    raceId = `${ID_PREFIX}_${Date.now().toString(36)}`;
    await db.query(
      'INSERT INTO "Race"(id,name,city,state,date,distances,organizer,status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())',
      [raceId, name, city, state, date, distStr, ORGANIZER, 'completed']
    );
  }

  // Preparar resultados válidos
  const valid = [];
  for (const r of results) {
    if (r.status && r.status !== 'valido') continue;
    const time = fmtTime(r.tempoLiquido || r.tempoBruto);
    if (!time) continue;
    const dist = normDist(r.distanciaInfo?.nome || r.distanciaInfo?.distanciaKm || '5');
    const km   = distKmNum(dist);
    const pace = r.pace || calcPace(time, km);
    valid.push({
      name:      (r.nomeAtleta || '').trim().toUpperCase().replace(/\s+/g, ' '),
      gender:    r.sexo === 'F' ? 'F' : r.sexo === 'M' ? 'M' : null,
      age:       (r.idade && r.idade > 0) ? r.idade : null,
      category:  r.faixaEtaria || r.categoria || null,
      dist, time, pace,
      rank:      r.posicaoGeral || 0,
      rankGender: r.posicaoFaixaEtaria || null,
    });
  }
  if (!valid.length) return 0;

  // Inserir atletas
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100);
    const vals = chunk.map((a, j) => {
      const id  = `${ID_PREFIX}_${(Date.now() + i + j).toString(36)}${j}`;
      const g   = a.gender === 'F' ? "'F'" : a.gender === 'M' ? "'M'" : 'NULL';
      const age = a.age ? a.age : 'NULL';
      return `('${id}','${esc(a.name)}',${g},'${state}',${age},NULL,1,0,NOW(),NOW())`;
    });
    await db.query(
      'INSERT INTO "Athlete"(id,name,gender,state,age,"birthDate","totalRaces","totalPoints","createdAt","updatedAt") VALUES ' +
      vals.join(',') + ' ON CONFLICT DO NOTHING'
    );
  }

  // Buscar IDs
  const names = [...new Set(valid.map(a => a.name))];
  const athleteMap = {};
  for (let i = 0; i < names.length; i += 100) {
    const chunk = names.slice(i, i + 100);
    const ph = chunk.map((_, j) => `$${j + 1}`).join(',');
    const rows = await db.query(`SELECT id,name FROM "Athlete" WHERE name IN (${ph})`, chunk);
    for (const r of rows.rows) athleteMap[r.name] = r.id;
  }

  // Inserir resultados
  let imported = 0;
  for (const a of valid) {
    const aid = athleteMap[a.name];
    if (!aid) continue;
    const id = `${ID_PREFIX}r_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    try {
      await db.query(
        'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,0,NOW()) ON CONFLICT DO NOTHING',
        [id, aid, raceId, a.time, a.pace, a.dist, a.category, a.rank, a.rankGender]
      );
      imported++;
    } catch (_) {}
  }
  return imported;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  console.log(`\n=== REGENI Scraper ChipTiming Resultado (nova plataforma) ===`);
  if (DRY_RUN) console.log('(DRY RUN)');

  // 1. Listar eventos
  let events = await fetchAllEvents();
  if (EVENTO) events = events.filter(e => e.slug === EVENTO || e.slug.includes(EVENTO));
  events = events.slice(0, LIMIT);
  console.log(`${events.length} eventos com resultados oficiais\n`);

  let totalImported = 0, totalSkip = 0, totalNew = 0;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const ano = (ev.dataInicio || '').slice(0, 4) || '2026';
    const label = (ev.nomeOficial || ev.slug).slice(0, 40).padEnd(40);
    process.stdout.write(`[${i + 1}/${events.length}] ${label}`);

    try {
      await DELAY(500);
      const results = await fetchResults(ev.slug, ano);
      process.stdout.write(` ${ano} R:${results.length}`);

      if (!results.length) { process.stdout.write(' sem-resultados'); totalSkip++; continue; }
      if (DRY_RUN) continue;

      const n = await importEvent(db, ev, results);
      if (n === -1) { totalSkip++; continue; }
      process.stdout.write(` → ${n}imp`);
      totalImported += n;
      totalNew++;

    } catch (e) {
      process.stdout.write(` ERRO: ${e.message.slice(0, 50)}`);
    }
    process.stdout.write('\n');
  }

  console.log('\n' + '='.repeat(60));
  console.log(`ChipTiming Resultado — ${totalImported} resultados importados`);
  console.log(`                       ${totalNew} novos eventos`);
  console.log(`                       ${totalSkip} pulados`);

  const r = await db.query('SELECT (SELECT COUNT(*) FROM "Race") c,(SELECT COUNT(*) FROM "Result") res,(SELECT COUNT(*) FROM "Athlete") a');
  console.log(`Banco: ${r.rows[0].c} corridas | ${r.rows[0].res} resultados | ${r.rows[0].a} atletas`);
  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
