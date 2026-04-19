#!/usr/bin/env node
/**
 * REGENI — Scraper RaceZone Universal (MyCrono, SportsChrono, RaceMS)
 * resultados.racezone.com.br — JSON puro, sem auth
 *
 * API:
 *   /{empresa}/data/events.json              → lista de eventos
 *   /{empresa}/data/{eventId}/event.json     → metadata + categorias
 *   /{empresa}/data/{eventId}/results.json   → resultados (nm, g, tg, tn, rg, a, ct)
 *
 * Uso:
 *   node scripts/scraper-racezone.cjs                    # todas as empresas
 *   node scripts/scraper-racezone.cjs --company mycrono  # só uma empresa
 *   node scripts/scraper-racezone.cjs --dry-run          # sem importação
 *   node scripts/scraper-racezone.cjs --limit 5          # máx 5 eventos por empresa
 */
'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const https = require('https');
const http = require('http');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL não definida'); process.exit(1); }

// Pool reconecta automaticamente — resolve o crash de "Connection terminated"
const db = new Pool({ connectionString: DB_URL, max: 3, idleTimeoutMillis: 30000 });

const args = process.argv.slice(2);
const getArg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const DRY_RUN  = args.includes('--dry-run');
const LIMIT    = parseInt(getArg('--limit') || '9999');
const COMPANY_FILTER = getArg('--company') || null;
const DELAY = ms => new Promise(r => setTimeout(r, ms));

const BASE_URL = 'https://resultados.racezone.com.br';

const EMPRESAS = [
  { slug: 'mycrono',      organizer: 'MyCrono',      idPrefix: 'myc', state: 'SC' },
  { slug: 'sportschrono', organizer: 'SportsChrono',  idPrefix: 'sc',  state: 'SE' },
  { slug: 'racems',       organizer: 'RaceMS',        idPrefix: 'rms', state: 'MS' },
];

// ─── HTTP ─────────────────────────────────────────────────────────────────────
function get(url, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error('too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120', 'Accept': 'application/json,*/*' },
      timeout: 20000,
    }, res => {
      if ([301,302,307,308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return get(next, depth + 1).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchJSON(url) {
  const body = await get(url);
  return JSON.parse(body);
}

// ─── Normalização ─────────────────────────────────────────────────────────────
const UF_MAP = {
  'SERGIPE':'SE','SÃO PAULO':'SP','SAO PAULO':'SP','RIO DE JANEIRO':'RJ',
  'MINAS GERAIS':'MG','BAHIA':'BA','CEARÁ':'CE','CEARA':'CE',
  'PERNAMBUCO':'PE','PARANÁ':'PR','PARANA':'PR','SANTA CATARINA':'SC',
  'RIO GRANDE DO SUL':'RS','GOIÁS':'GO','GOIAS':'GO','MARANHÃO':'MA',
  'MARANHAO':'MA','PARÁ':'PA','PARA':'PA','AMAZONAS':'AM',
  'MATO GROSSO':'MT','MATO GROSSO DO SUL':'MS','ALAGOAS':'AL',
  'PIAUÍ':'PI','PIAUI':'PI','RIO GRANDE DO NORTE':'RN','PARAÍBA':'PB',
  'PARAIBA':'PB','ESPÍRITO SANTO':'ES','ESPIRITO SANTO':'ES',
  'TOCANTINS':'TO','RONDÔNIA':'RO','RONDONIA':'RO','ACRE':'AC',
  'RORAIMA':'RR','AMAPÁ':'AP','AMAPA':'AP','DISTRITO FEDERAL':'DF',
};

function parsePlace(place, defaultState) {
  if (!place) return { city: '', state: defaultState };
  const parts = place.split('-').map(s => s.trim());
  const city = parts[0] || '';
  const raw = (parts[parts.length - 1] || '').toUpperCase().trim();
  const state = UF_MAP[raw] || (raw.length === 2 ? raw : defaultState);
  return { city, state };
}

function normDist(name) {
  if (!name) return '5K';
  const up = name.toUpperCase();
  if (/42\s*K|MARAT/.test(up)) return '42K';
  if (/21\s*K|MEIA/.test(up))  return '21K';
  if (/15\s*K/.test(up))       return '15K';
  if (/12\s*K/.test(up))       return '12K';
  if (/10\s*K|11\s*K|9\s*K/.test(up)) return '10K';
  if (/8\s*K|7[,.]5/.test(up)) return '8K';
  if (/7\s*K/.test(up))        return '7K';
  if (/6\s*K/.test(up))        return '6K';
  if (/5\s*K/.test(up))        return '5K';
  if (/3\s*K/.test(up))        return '3K';
  return '5K';
}

const DIST_KM = { '42K':42,'21K':21,'15K':15,'12K':12,'10K':10,'8K':8,'7K':7,'6K':6,'5K':5,'3K':3 };

function fmtTime(raw) {
  if (!raw) return null;
  const parts = raw.split(':');
  if (parts.length !== 3) return null;
  const h = parseInt(parts[0]), m = parseInt(parts[1]), s = Math.floor(parseFloat(parts[2]));
  if (isNaN(h) || isNaN(m) || isNaN(s) || (!h && !m && !s)) return null;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function calcPace(time, km) {
  if (!time || !km) return null;
  const [h,m,s] = time.split(':').map(Number);
  const sec = h*3600 + m*60 + s;
  if (!sec) return null;
  const ps = sec / km;
  return Math.floor(ps/60) + ':' + String(Math.round(ps%60)).padStart(2,'0');
}

function esc(s) { return String(s || '').replace(/'/g, "''"); }

// ─── Importar evento ──────────────────────────────────────────────────────────
async function importEvent(empresa, evt, eventData, rawResults) {
  const { slug, organizer, idPrefix, state: defaultState } = empresa;
  const { city, state } = parsePlace(evt.place, defaultState);
  const name = (evt.name || evt.id).slice(0, 200);
  const dateStr = evt.startDate || '2025-01-01';

  // Mapa de categorias: id → nome
  const catMap = {};
  if (Array.isArray(eventData.categories)) {
    for (const cat of eventData.categories) catMap[cat.i] = cat.n;
  }

  // Detectar distância pelo nome do evento ou categorias
  const dist = normDist(name);
  const km = DIST_KM[dist] || 5;

  // Verificar duplicata
  const ex = await db.query(
    `SELECT id FROM "Race" WHERE name ILIKE $1 AND organizer=$2 LIMIT 1`,
    ['%' + name.slice(0,25).replace(/%/g,'') + '%', organizer]
  );

  let raceId;
  if (ex.rows.length) {
    raceId = ex.rows[0].id;
    const chk = await db.query('SELECT COUNT(*) c FROM "Result" WHERE "raceId"=$1', [raceId]);
    if (parseInt(chk.rows[0].c) > 0) {
      process.stdout.write(' JÁ');
      return -1;
    }
  } else {
    raceId = `${idPrefix}_${Date.now().toString(36)}`;
    await db.query(
      'INSERT INTO "Race"(id,name,city,state,date,distances,organizer,status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())',
      [raceId, name, city || state, state, dateStr, dist, organizer, 'completed']
    );
  }

  // Preparar atletas válidos
  const valid = [];
  for (let i = 0; i < rawResults.length; i++) {
    const r = rawResults[i];
    const athleteName = (r.nm || '').trim().toUpperCase().replace(/\s+/g,' ');
    if (!athleteName || athleteName.length < 2) continue;
    const time = fmtTime(r.tn || r.tg); // prefere net time
    if (!time) continue;
    const gender = r.g === 'F' ? 'F' : r.g === 'M' ? 'M' : null;
    // Categoria: busca pelo id que aparece em ct ou c
    const catId = r.c || Object.keys(r.ct || {}).find(k => r.ct[k]);
    valid.push({
      name: athleteName,
      gender,
      age: r.a ? parseInt(r.a) : null,
      state,
      time,
      pace: calcPace(time, km),
      dist,
      ageGroup: catId ? (catMap[catId] || null) : null,
      overallRank: r.n ? parseInt(r.n) : (i + 1),
      genderRank: r.rg ? parseInt(r.rg) : null,
    });
  }

  if (!valid.length) return 0;

  // Inserir atletas em chunks
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100);
    const vals = chunk.map((a, j) => {
      const id = `${idPrefix}_${(Date.now()+i+j).toString(36)}${j}`;
      const g  = a.gender === 'F' ? "'F'" : a.gender === 'M' ? "'M'" : 'NULL';
      const age = a.age ? a.age : 'NULL';
      return `('${id}','${esc(a.name)}',${g},'${esc(a.state)}',${age},NULL,1,0,NOW(),NOW())`;
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
    const ph = chunk.map((_,j) => `$${j+1}`).join(',');
    const rows = await db.query(`SELECT id,name FROM "Athlete" WHERE name IN (${ph})`, chunk);
    for (const row of rows.rows) athleteMap[row.name] = row.id;
  }

  // Inserir resultados
  let imported = 0;
  for (const a of valid) {
    const aid = athleteMap[a.name];
    if (!aid) continue;
    const id = `${idPrefix}r_${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`;
    try {
      await db.query(
        'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,0,NOW()) ON CONFLICT DO NOTHING',
        [id, aid, raceId, a.time, a.pace, a.dist, a.ageGroup, a.overallRank, a.genderRank]
      );
      imported++;
    } catch(_) {}
  }
  return imported;
}

// ─── Processar uma empresa ────────────────────────────────────────────────────
async function processEmpresa(empresa) {
  const { slug, organizer } = empresa;
  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`[${organizer}] https://resultados.racezone.com.br/${slug}`);

  let events;
  try {
    events = await fetchJSON(`${BASE_URL}/${slug}/data/events.json`);
  } catch(e) {
    console.log(`  ERRO ao listar eventos: ${e.message}`);
    return { imported: 0, skipped: 0, errors: 1 };
  }

  events = events.slice(0, LIMIT);
  console.log(`  ${events.length} eventos encontrados\n`);

  let totalImported = 0, totalSkip = 0, totalNew = 0;

  for (let i = 0; i < events.length; i++) {
    const evt = events[i];
    const label = (evt.name || evt.id).slice(0, 35);
    process.stdout.write(`  [${i+1}/${events.length}] ${label.padEnd(35)}`);

    try {
      await DELAY(500);

      // Checar skip antes de buscar resultados
      const ex = await db.query(
        `SELECT id FROM "Race" WHERE name ILIKE $1 AND organizer=$2 LIMIT 1`,
        ['%' + (evt.name||evt.id).slice(0,20).replace(/%/g,'') + '%', organizer]
      );
      if (ex.rows.length) {
        const chk = await db.query('SELECT COUNT(*) c FROM "Result" WHERE "raceId"=$1', [ex.rows[0].id]);
        if (parseInt(chk.rows[0].c) > 0) {
          process.stdout.write(' JÁ\n');
          totalSkip++;
          continue;
        }
      }

      // Buscar event.json e results.json
      const [eventData, rawResults] = await Promise.all([
        fetchJSON(`${BASE_URL}/${slug}/data/${evt.id}/event.json`).catch(() => ({ categories: [] })),
        fetchJSON(`${BASE_URL}/${slug}/data/${evt.id}/results.json`).catch(() => []),
      ]);

      process.stdout.write(` R:${rawResults.length}`);

      if (!rawResults.length) {
        process.stdout.write(' sem-resultados\n');
        totalSkip++;
        continue;
      }

      if (DRY_RUN) {
        process.stdout.write(` (dry-run)\n`);
        continue;
      }

      const n = await importEvent(empresa, evt, eventData, rawResults);
      if (n === -1) { totalSkip++; process.stdout.write('\n'); continue; }
      process.stdout.write(` → ${n}imp\n`);
      totalImported += n;
      totalNew++;

    } catch(e) {
      process.stdout.write(` ERRO: ${e.message.slice(0,50)}\n`);
    }
  }

  return { imported: totalImported, skipped: totalSkip, newEvents: totalNew };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== REGENI Scraper RaceZone Universal ===`);
  if (DRY_RUN) console.log('(DRY RUN)');

  const empresas = COMPANY_FILTER
    ? EMPRESAS.filter(e => e.slug === COMPANY_FILTER)
    : EMPRESAS;

  if (!empresas.length) {
    console.error(`Empresa "${COMPANY_FILTER}" não encontrada. Válidas: ${EMPRESAS.map(e=>e.slug).join(', ')}`);
    process.exit(1);
  }

  console.log(`Empresas: ${empresas.map(e=>e.slug).join(', ')}\n`);

  let grandTotal = 0;
  for (const empresa of empresas) {
    const { imported } = await processEmpresa(empresa);
    grandTotal += imported;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`RACEZONE TOTAL — ${grandTotal} resultados importados`);

  const r = await db.query('SELECT (SELECT COUNT(*) FROM "Race") c,(SELECT COUNT(*) FROM "Result") res,(SELECT COUNT(*) FROM "Athlete") a');
  console.log(`Banco: ${r.rows[0].c} corridas | ${r.rows[0].res} resultados | ${r.rows[0].a} atletas`);
  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
