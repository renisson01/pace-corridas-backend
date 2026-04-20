#!/usr/bin/env node
/**
 * REGENI — Scraper ChipMacapá (CLAX/Wiclax via brlive.info)
 * Lista em: https://chipmacapa.com.br/resultados
 * CLAX em:  https://brlive.info/brlive/{path}
 *
 * Uso:
 *   node scripts/scraper-chipmacapa.cjs             # importar tudo
 *   node scripts/scraper-chipmacapa.cjs --dry-run   # sem importação
 *   node scripts/scraper-chipmacapa.cjs --limit 3   # máx 3 eventos
 */
'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const https = require('https');
const http  = require('http');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL não definida'); process.exit(1); }

const db = new Pool({ connectionString: DB_URL, max: 3, idleTimeoutMillis: 30000 });

const args    = process.argv.slice(2);
const getArg  = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const DRY_RUN = args.includes('--dry-run');
const LIMIT   = parseInt(getArg('--limit') || '9999');
const DELAY   = ms => new Promise(r => setTimeout(r, ms));

const ORGANIZER     = 'ChipMacapá';
const ID_PREFIX     = 'cma';
const DEFAULT_STATE = 'AP';
const LISTING_URL   = 'https://chipmacapa.com.br/resultados';
const CLAX_BASE     = 'https://brlive.info/brlive';

// ─── HTTP ─────────────────────────────────────────────────────────────────────
function get(url, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error('too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120', 'Accept': '*/*' },
      timeout: 30000,
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

// ─── Listing ──────────────────────────────────────────────────────────────────
async function listEvents() {
  const html = await get(LISTING_URL);
  const events = [];
  const re = /brlive\.info\/brlive\/brlive-bsb\.html\?f=(resultados\/bsb\/[^"'\s]+\.clax)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const claxPath = m[1];
    if (!events.find(e => e.claxPath === claxPath)) {
      events.push({ claxPath, claxUrl: `${CLAX_BASE}/${claxPath}` });
    }
  }
  return events;
}

// ─── Parse CLAX (Wiclax XML) ──────────────────────────────────────────────────
function xmlAttr(tag, name) {
  const m = new RegExp(`${name}="([^"]*)"`, 'i').exec(tag);
  return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"') : '';
}

const MONTHS_PT = {
  janeiro:1, fevereiro:2, 'março':3, marco:3, abril:4, maio:5, junho:6,
  julho:7, agosto:8, setembro:9, outubro:10, novembro:11, dezembro:12,
};
function parsePtDate(str) {
  if (!str) return '2025-01-01';
  const m = /(\d{1,2}) de ([a-záàâãéèêíïóôõúüçñ]+) de (\d{4})/i.exec(str);
  if (!m) return '2025-01-01';
  const day   = parseInt(m[1]);
  const month = MONTHS_PT[m[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')] || 1;
  const year  = parseInt(m[3]);
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

// 00h16'33  ou  00h16'33"789  →  00:16:33
function parseClaxTime(raw) {
  if (!raw) return null;
  const m = /^(\d+)h(\d+)'(\d+)/.exec(raw.trim());
  if (!m) return null;
  const h = parseInt(m[1]), mi = parseInt(m[2]), s = parseInt(m[3]);
  if (!h && !mi && !s) return null;
  return `${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// pace "03:19" já está em min:seg/km
function normPace(raw) {
  if (!raw || !/^\d+:\d+$/.test(raw.trim())) return null;
  return raw.trim();
}

function calcPace(time, km) {
  if (!time || !km) return null;
  const [h,m,s] = time.split(':').map(Number);
  const sec = h*3600 + m*60 + s;
  if (!sec) return null;
  const ps = sec / km;
  return Math.floor(ps/60) + ':' + String(Math.round(ps%60)).padStart(2,'0');
}

function distLabel(km) {
  if (km >= 40) return '42K';
  if (km >= 20) return '21K';
  if (km >= 14) return '15K';
  if (km >= 11) return '12K';
  if (km >= 9)  return '10K';
  if (km >= 7)  return '8K';
  if (km >= 6)  return '7K';
  if (km >= 5)  return '6K';
  if (km >= 4)  return '5K';
  if (km >= 2)  return '3K';
  return '5K';
}

function parseClax(xml) {
  // Event metadata
  const evtMatch = /<Epreuve ([^>]*)>/i.exec(xml);
  if (!evtMatch) return null;
  const evtTag = evtMatch[1];

  const eventName = xmlAttr(evtTag, 'nom');
  const datesStr  = xmlAttr(evtTag, 'dates');
  const date      = parsePtDate(datesStr);

  // Etapas: pode haver múltiplos percursos — pega o maior
  const etapRe = /<Etape [^>]*distance="(\d+)"/gi;
  let maxDist = 0;
  let em;
  while ((em = etapRe.exec(xml)) !== null) {
    const d = parseInt(em[1]);
    if (d > maxDist) maxDist = d;
  }
  const distKm = Math.round(maxDist / 1000) || 5;
  const dist    = distLabel(distKm);

  // Athletes map: dossard → dados
  const athletes = {};
  const eRe = /<E ([^/]*)\/?>/g;
  let m;
  while ((m = eRe.exec(xml)) !== null) {
    const tag = m[1];
    const d   = xmlAttr(tag, 'd');
    if (!d) continue;
    const bYear = parseInt(xmlAttr(tag, 'a')) || null;
    athletes[d] = {
      name:     xmlAttr(tag, 'n').trim().toUpperCase().replace(/\s+/g,' '),
      gender:   xmlAttr(tag, 'x') || null,
      age:      bYear ? (new Date().getFullYear() - bYear) : null,
      ageGroup: xmlAttr(tag, 'ca') || null,
    };
  }

  // Results: <R d="..." t="time" m="pace" re="net_time">
  const results = [];
  const rRe = /<R ([^/]*)\/?>/g;
  let rank = 0;
  while ((m = rRe.exec(xml)) !== null) {
    const tag  = m[1];
    const d    = xmlAttr(tag, 'd');
    const rawT = xmlAttr(tag, 're') || xmlAttr(tag, 't'); // net time preferred
    const time = parseClaxTime(rawT);
    if (!d || !time) continue;
    rank++;
    const ath  = athletes[d] || {};
    if (!ath.name || ath.name.length < 2) continue;
    const rawPace = xmlAttr(tag, 'm');
    results.push({
      ...ath,
      time,
      pace: normPace(rawPace) || calcPace(time, distKm),
      dist,
      overallRank: rank,
    });
  }

  return { eventName, date, dist, km: distKm, results };
}

// ─── Importar evento ──────────────────────────────────────────────────────────
function esc(s) { return String(s || '').replace(/'/g, "''"); }

async function importEvent(parsed) {
  const { eventName, date, dist, km, results } = parsed;
  const name = eventName.slice(0, 200);

  const ex = await db.query(
    `SELECT id FROM "Race" WHERE name ILIKE $1 AND organizer=$2 LIMIT 1`,
    ['%' + name.slice(0, 25).replace(/%/g, '') + '%', ORGANIZER]
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
    raceId = `${ID_PREFIX}_${Date.now().toString(36)}`;
    await db.query(
      'INSERT INTO "Race"(id,name,city,state,date,distances,organizer,status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())',
      [raceId, name, 'Macapá', DEFAULT_STATE, date, dist, ORGANIZER, 'completed']
    );
  }

  const valid = results.filter(r => r.name && r.name.length >= 2 && r.time);
  if (!valid.length) return 0;

  // Inserir atletas em chunks
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100);
    const vals = chunk.map((a, j) => {
      const id = `${ID_PREFIX}_${(Date.now()+i+j).toString(36)}${j}`;
      const g  = a.gender === 'F' ? "'F'" : a.gender === 'M' ? "'M'" : 'NULL';
      const age = a.age ? a.age : 'NULL';
      return `('${id}','${esc(a.name)}',${g},'${DEFAULT_STATE}',${age},NULL,1,0,NOW(),NOW())`;
    });
    await db.query(
      'INSERT INTO "Athlete"(id,name,gender,state,age,"birthDate","totalRaces","totalPoints","createdAt","updatedAt") VALUES ' +
      vals.join(',') + ' ON CONFLICT DO NOTHING'
    );
  }

  // Buscar IDs dos atletas
  const names = [...new Set(valid.map(a => a.name))];
  const athleteMap = {};
  for (let i = 0; i < names.length; i += 100) {
    const chunk = names.slice(i, i + 100);
    const ph    = chunk.map((_,j) => `$${j+1}`).join(',');
    const rows  = await db.query(`SELECT id,name FROM "Athlete" WHERE name IN (${ph})`, chunk);
    for (const row of rows.rows) athleteMap[row.name] = row.id;
  }

  // Inserir resultados
  let imported = 0;
  for (const a of valid) {
    const aid = athleteMap[a.name];
    if (!aid) continue;
    const id = `${ID_PREFIX}r_${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`;
    try {
      await db.query(
        'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt",source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,0,NOW(),$10) ON CONFLICT DO NOTHING',
        [id, aid, raceId, a.time, a.pace, a.dist, a.ageGroup, a.overallRank, null, ORGANIZER]
      );
      imported++;
    } catch(_) {}
  }
  return imported;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== REGENI Scraper ChipMacapá (CLAX) ===');
  if (DRY_RUN) console.log('(DRY RUN)');

  let events;
  try {
    events = await listEvents();
  } catch(e) {
    console.error('ERRO ao listar eventos:', e.message);
    process.exit(1);
  }

  events = events.slice(0, LIMIT);
  console.log(`${events.length} eventos encontrados\n`);

  let totalImported = 0, totalSkip = 0;

  for (let i = 0; i < events.length; i++) {
    const { claxPath, claxUrl } = events[i];
    const label = claxPath.split('/').pop().replace('.clax','').slice(0,40);
    process.stdout.write(`[${i+1}/${events.length}] ${label.padEnd(40)}`);

    try {
      await DELAY(800);
      const xml    = await get(claxUrl);
      const parsed = parseClax(xml);

      if (!parsed) { process.stdout.write(' XML-INVÁLIDO\n'); totalSkip++; continue; }
      if (!parsed.results.length) { process.stdout.write(' sem-resultados\n'); totalSkip++; continue; }

      process.stdout.write(` R:${parsed.results.length}`);

      if (DRY_RUN) {
        process.stdout.write(` | ${parsed.eventName.slice(0,30)} | ${parsed.date} (dry-run)\n`);
        continue;
      }

      const n = await importEvent(parsed);
      if (n === -1) { totalSkip++; process.stdout.write('\n'); continue; }
      process.stdout.write(` → ${n}imp\n`);
      totalImported += n;

    } catch(e) {
      process.stdout.write(` ERRO: ${e.message.slice(0,50)}\n`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`CHIPMACAPÁ TOTAL — ${totalImported} resultados importados`);

  const r = await db.query('SELECT (SELECT COUNT(*) FROM "Race") c,(SELECT COUNT(*) FROM "Result") res,(SELECT COUNT(*) FROM "Athlete") a');
  console.log(`Banco: ${r.rows[0].c} corridas | ${r.rows[0].res} resultados | ${r.rows[0].a} atletas`);
  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
