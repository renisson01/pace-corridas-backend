#!/usr/bin/env node
/**
 * REGENI — Scraper CronosChip (Wiclax CLAX/XML)
 * cronoschip.com.br — 100 eventos Bahia/Nordeste
 *
 * Formato: XML Wiclax (.clax)
 *   <E d="dossard" n="nome" a="anoNasc" x="M/F" ca="categoria" p="distância" />
 *   <R d="dossard" t="00h28'24,8" m="03:20" />  (em ordem de classificação)
 *
 * Uso:
 *   node scripts/scraper-cronoschip.cjs
 *   node scripts/scraper-cronoschip.cjs --dry-run
 *   node scripts/scraper-cronoschip.cjs --limit 5
 */
const { Client } = require('pg');
const https = require('https');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL não definida'); process.exit(1); }

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = parseInt(args[args.indexOf('--limit') + 1] || '9999');
const DELAY = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'https://cronoschip.com.br/report/resultados/';

// ─── HTTP ─────────────────────────────────────────────────────────────────────
function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120', 'Accept': '*/*',
                 'Referer': 'https://cronoschip.com.br/resultados' },
      timeout: 30000,
    }, res => {
      if ([301,302,307,308].includes(res.statusCode) && res.headers.location) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ─── Parse CLAX viewer page → lista de URLs CLAX ─────────────────────────────
function parseClaxUrls(html) {
  const urls = new Set();
  const re = /g-live\.html\?f=(evento\/[^'"&\s]+\.clax)/g;
  let m;
  while ((m = re.exec(html)) !== null) urls.add(decodeURIComponent(m[1]));
  return [...urls];
}

// ─── Parse XML CLAX ───────────────────────────────────────────────────────────
function parseClax(xml) {
  // Meta do evento
  const evM = xml.match(/<Epreuve[^>]+>/);
  if (!evM) return null;
  const evTag = evM[0];

  const attr = (tag, name) => { const m = tag.match(new RegExp(`${name}="([^"]+)"`)); return m ? m[1] : ''; };
  const nom = attr(evTag, 'nom');
  const org = attr(evTag, 'organisateur');
  const datesStr = attr(evTag, 'dates'); // "domingo, 7 de dezembro de 2025"

  // Converter data PT para YYYY-MM-DD
  const meses = {janeiro:1,fevereiro:2,março:3,marco:3,abril:4,maio:5,junho:6,
                 julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};
  let date = null;
  const dm = datesStr.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
  if (dm) {
    const mes = meses[dm[2].toLowerCase()];
    if (mes) date = `${dm[3]}-${String(mes).padStart(2,'0')}-${dm[1].padStart(2,'0')}`;
  }
  // Fallback: formato dd/mm/yyyy
  if (!date) {
    const d2 = datesStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (d2) date = `${d2[3]}-${d2[2]}-${d2[1]}`;
  }

  // Parse atletas <E>
  const athletes = {};
  const eRe = /<E d="(\d+)"[^/]*n="([^"]+)"[^/]*a="(\d+)"[^/]*x="([^"]+)"[^/]*ca="([^"]*)"[^/]*p="([^"]*)"/g;
  let em;
  while ((em = eRe.exec(xml)) !== null) {
    const doss = em[1];
    athletes[doss] = {
      name: em[2].trim().toUpperCase().replace(/\s+/g,' '),
      birthYear: parseInt(em[3]) || null,
      gender: em[4] === 'F' ? 'F' : em[4] === 'M' ? 'M' : null,
      category: em[5] || null,
      distance: em[6].replace(',','.'), // "8,5KM" → "8.5KM"
    };
  }

  // Parse resultados <R> — ordem = classificação geral
  const results = [];
  const rRe = /<R d="(\d+)"[^/]*t="([^"]+)"[^/]*m="([^"]*)"/g;
  let rm;
  while ((rm = rRe.exec(xml)) !== null) {
    results.push({ doss: rm[1], rawTime: rm[2], pace: rm[3] });
  }

  return { nom, org, date, athletes, results };
}

// ─── Normalizar tempo Wiclax: "00h28'24,8" → "00:28:24" ─────────────────────
function fmtTime(raw) {
  if (!raw) return null;
  const m = raw.match(/^(\d+)h(\d+)'(\d+)[,.]?\d*$/);
  if (!m) return null;
  const h = parseInt(m[1]), min = parseInt(m[2]), s = parseInt(m[3]);
  if (!h && !min && !s) return null;
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ─── Normalizar distância ─────────────────────────────────────────────────────
function normDist(d) {
  const n = parseFloat(String(d || '5').replace(/[^0-9.]/g, ''));
  if (n >= 40) return '42K'; if (n >= 20) return '21K'; if (n >= 14) return '15K';
  if (n >= 12) return '12K'; if (n >= 9) return '10K'; if (n >= 7.5) return '8K';
  if (n >= 6.5) return '7K'; if (n >= 5.5) return '6K'; if (n >= 4) return '5K'; return '3K';
}

function esc(s) { return String(s || '').replace(/'/g, "''"); }

// ─── Importar evento ──────────────────────────────────────────────────────────
async function importEvent(db, claxPath, parsed) {
  const { nom, org, date, athletes, results } = parsed;
  if (!results.length) return 0;

  // Nome legível do evento (slug → título)
  const name = nom.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).trim().slice(0,200)
    || claxPath.split('/').pop().replace('.clax','');
  const dateStr = date || '2025-01-01';

  // Extrair estado da BA região (CronosChip é Bahia)
  const state = 'BA';
  const city = 'Bahia';

  // Verificar duplicata
  const ex = await db.query(
    'SELECT id FROM "Race" WHERE name ILIKE $1 AND organizer=\'CronosChip\' LIMIT 1',
    ['%' + name.slice(0,20).replace(/%/g,'') + '%']
  );
  let raceId;
  const distSet = new Set(results.map(r => {
    const a = athletes[r.doss];
    return a ? normDist(a.distance) : '5K';
  }));
  const distStr = [...distSet].join(',') || '5K';

  if (ex.rows.length) {
    raceId = ex.rows[0].id;
    const chk = await db.query('SELECT COUNT(*) c FROM "Result" WHERE "raceId"=$1', [raceId]);
    if (parseInt(chk.rows[0].c) > 0) { process.stdout.write(' JÁ'); return -1; }
  } else {
    raceId = `cc_${Date.now().toString(36)}`;
    await db.query(
      'INSERT INTO "Race"(id,name,city,state,date,distances,organizer,status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())',
      [raceId, name, city, state, dateStr, distStr, 'CronosChip', 'completed']
    );
  }

  // Montar lista de atletas válidos com resultados
  const valid = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const a = athletes[r.doss];
    if (!a) continue;
    const time = fmtTime(r.rawTime);
    if (!time) continue;
    valid.push({
      name: a.name, gender: a.gender, state,
      category: a.category,
      birthYear: a.birthYear,
      dist: normDist(a.distance),
      time, pace: r.pace,
      rank: i + 1,
    });
  }
  if (!valid.length) return 0;

  // Inserir atletas
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100);
    const vals = chunk.map((a, j) => {
      const id = `cc_${(Date.now()+i+j).toString(36)}${j}`;
      const g = a.gender === 'F' ? "'F'" : a.gender === 'M' ? "'M'" : 'NULL';
      const age = a.birthYear ? (2025 - a.birthYear) : 'NULL';
      return `('${id}','${esc(a.name)}',${g},'BA',${age},NULL,1,0,NOW(),NOW())`;
    });
    await db.query('INSERT INTO "Athlete"(id,name,gender,state,age,"birthDate","totalRaces","totalPoints","createdAt","updatedAt") VALUES ' + vals.join(',') + ' ON CONFLICT DO NOTHING');
  }

  // Buscar IDs
  const names = [...new Set(valid.map(a => a.name))];
  const athleteMap = {};
  for (let i = 0; i < names.length; i += 100) {
    const chunk = names.slice(i, i + 100);
    const ph = chunk.map((_,j) => `$${j+1}`).join(',');
    const rows = await db.query(`SELECT id,name FROM "Athlete" WHERE name IN (${ph})`, chunk);
    for (const r of rows.rows) athleteMap[r.name] = r.id;
  }

  // Inserir resultados — calcular genderRank em memória
  const genderCount = { M: 0, F: 0 };
  let imported = 0;
  for (const a of valid) {
    const aid = athleteMap[a.name];
    if (!aid) continue;
    const gr = a.gender ? ++genderCount[a.gender] : null;
    const id = `ccr_${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`;
    try {
      await db.query(
        'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,0,NOW()) ON CONFLICT DO NOTHING',
        [id, aid, raceId, a.time, a.pace, a.dist, a.category, a.rank, gr]
      );
      imported++;
    } catch(_) {}
  }
  return imported;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  console.log('\n=== REGENI Scraper CronosChip (Wiclax) ===');
  if (DRY_RUN) console.log('(DRY RUN)');

  // 1. Listar eventos
  const html = await get('https://cronoschip.com.br/resultados');
  const claxPaths = parseClaxUrls(html).slice(0, LIMIT);
  console.log(`${claxPaths.length} eventos encontrados\n`);

  let totalImported = 0, totalSkip = 0, totalNew = 0;

  for (let i = 0; i < claxPaths.length; i++) {
    const path = claxPaths[i];
    const eventName = path.split('/').pop().replace('.clax','');
    process.stdout.write(`\n[${i+1}/${claxPaths.length}] ${eventName.slice(0,40).padEnd(40)}`);

    try {
      await DELAY(600);
      const xml = await get(BASE + path);

      // Verificar se é XML (não HTML de erro)
      if (!xml.startsWith('\uFEFF<?xml') && !xml.startsWith('<?xml')) {
        process.stdout.write(' sem-clax');
        totalSkip++;
        continue;
      }

      const parsed = parseClax(xml);
      if (!parsed) { process.stdout.write(' parse-erro'); totalSkip++; continue; }

      const athleteCount = Object.keys(parsed.athletes).length;
      const resultCount = parsed.results.length;
      process.stdout.write(` ${parsed.date||'?'} E:${athleteCount} R:${resultCount}`);

      if (!resultCount) { process.stdout.write(' sem-resultados'); totalSkip++; continue; }
      if (DRY_RUN) continue;

      const n = await importEvent(db, path, parsed);
      if (n === -1) { totalSkip++; continue; }
      process.stdout.write(` → ${n}imp`);
      totalImported += n;
      totalNew++;

    } catch(e) {
      process.stdout.write(` ERRO: ${e.message.slice(0,50)}`);
    }
  }

  console.log('\n\n' + '='.repeat(60));
  console.log(`CRONOSCHIP — ${totalImported} resultados importados`);
  console.log(`             ${totalNew} novos eventos`);
  console.log(`             ${totalSkip} pulados`);

  const r = await db.query('SELECT (SELECT COUNT(*) FROM "Race") c,(SELECT COUNT(*) FROM "Result") res,(SELECT COUNT(*) FROM "Athlete") a');
  console.log(`Banco: ${r.rows[0].c} corridas | ${r.rows[0].res} resultados | ${r.rows[0].a} atletas`);
  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
