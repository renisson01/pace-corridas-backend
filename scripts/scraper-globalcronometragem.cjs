#!/usr/bin/env node
/**
 * REGENI — Scraper GlobalCronometragem
 * globalcronometragem.com.br — PHP app, HTML tables, ~74 eventos SP/interior
 *
 * Uso:
 *   node scripts/scraper-globalcronometragem.cjs
 *   node scripts/scraper-globalcronometragem.cjs --dry-run
 *   node scripts/scraper-globalcronometragem.cjs --limit 5
 */
const { Client } = require('pg');
const https = require('https');
const http = require('http');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL não definida'); process.exit(1); }

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = parseInt(args[args.indexOf('--limit') + 1] || '9999');
const DELAY = ms => new Promise(r => setTimeout(r, ms));

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function get(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120', 'Accept': 'text/html,*/*' },
      timeout: 30000,
    }, res => {
      if ([301,302,307,308].includes(res.statusCode) && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : 'https://globalcronometragem.com.br' + res.headers.location;
        return get(loc).then(resolve).catch(reject);
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ─── Parse helpers ────────────────────────────────────────────────────────────
function decodeSlug(s) {
  try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; }
}

// Extrai todos slugs únicos da página de resultados
function parseEventSlugs(html) {
  const slugs = new Set();
  const re = /href="\/evento\.php\?slug=([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) slugs.add(m[1]);
  return [...slugs];
}

// Extrai links de resultado (.txt) da página do evento
function parseResultLinks(html) {
  const links = [];
  const re = /href="(\/resultado\.php\?arquivo=[^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!links.includes(m[1])) links.push(m[1]);
  }
  return links;
}

// Extrai nome e data do evento da página
function parseEventMeta(html, slug) {
  const nameM = html.match(/<h1[^>]*class="page-title"[^>]*>([^<]+)</) ||
                html.match(/<title>([^<|—]+)/);
  const name = nameM ? nameM[1].trim().replace(/\s+/g,' ') : decodeSlug(slug).replace(/-/g,' ');

  // Procurar data em formato dd/mm/yyyy ou dd de mês de yyyy
  const dateM = html.match(/(\d{2})\/(\d{2})\/(\d{4})/) ||
                html.match(/(\d{2})\s+de\s+\w+\s+de\s+(\d{4})/);
  let date = null;
  if (dateM && dateM[3]) {
    date = `${dateM[3]}-${dateM[2]}-${dateM[1]}`;
  }

  // Cidade/Estado de info-cards ou endereço
  const cityM = html.match(/fa-map-marker[^<]*<\/i>\s*([^<,]{2,40})/);
  const city = cityM ? cityM[1].trim() : 'SP';

  return { name, date, city, state: 'SP' };
}

// Extrai nome da modalidade/distância do arquivo de resultado
function parseModalityName(html) {
  const m = html.match(/<h1[^>]*class="page-title"[^>]*>([^<]+)</) ||
            html.match(/<title>([^<|—]+)/);
  return m ? m[1].trim() : '';
}

// Extrai atletas da tabela HTML
function parseAthletes(html) {
  const athletes = [];
  // Extrair todas as linhas <tr>
  const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
  let rowM;
  while ((rowM = rowRe.exec(html)) !== null) {
    const row = rowM[1];
    // Extrair colunas
    const cols = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let tdM;
    while ((tdM = tdRe.exec(row)) !== null) {
      cols.push(tdM[1].replace(/<[^>]+>/g, '').trim());
    }
    if (cols.length < 7) continue;

    // Colunas: 0=PosGeral, 1=PosCat, 2=NumPeito, 3=Nome, 4=Sexo, 5=Categoria, 6=TempoBruto, 7=TempoLiquido, 8=Pace
    const rank = parseInt(cols[0]) || null;
    const name = cols[3] ? cols[3].toUpperCase().replace(/\s+/g,' ').trim() : null;
    const gender = cols[4] === 'F' ? 'F' : cols[4] === 'M' ? 'M' : null;
    const ageGroup = cols[5] || null;
    const timeRaw = cols[7] || cols[6]; // prefere tempo líquido
    const paceRaw = cols[8] ? cols[8].replace('/km','').trim() : null;

    if (!name || name.length < 2) continue;
    if (!timeRaw || !timeRaw.match(/^\d{2}:\d{2}:\d{2}$/)) continue;

    athletes.push({ rank, name, gender, ageGroup, time: timeRaw, pace: paceRaw });
  }
  return athletes;
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function normDist(modName) {
  const n = modName.match(/(\d+(?:[.,]\d+)?)\s*k/i);
  if (!n) return '5K';
  const km = parseFloat(n[1].replace(',','.'));
  if (km >= 40) return '42K'; if (km >= 20) return '21K'; if (km >= 14) return '15K';
  if (km >= 12) return '12K'; if (km >= 9) return '10K'; if (km >= 7.5) return '8K';
  if (km >= 6.5) return '7K'; if (km >= 5.5) return '6K'; if (km >= 4) return '5K'; return '3K';
}

function esc(s) { return String(s || '').replace(/'/g, "''"); }

// ─── Importar para o banco ────────────────────────────────────────────────────
async function importEvent(db, meta, allAthletes, dist) {
  if (!allAthletes.length) return 0;

  const dateStr = meta.date || '2025-01-01';

  // Verificar se já existe
  const ex = await db.query(
    'SELECT id FROM "Race" WHERE name ILIKE $1 AND organizer=\'GlobalCronometragem\' LIMIT 1',
    ['%' + meta.name.slice(0, 25).replace(/%/g,'') + '%']
  );
  let raceId;
  if (ex.rows.length) {
    raceId = ex.rows[0].id;
    const chk = await db.query('SELECT COUNT(*) c FROM "Result" WHERE "raceId"=$1 AND distance=$2', [raceId, dist]);
    if (parseInt(chk.rows[0].c) > 0) { return -1; }
  } else {
    raceId = `gc_${Date.now().toString(36)}`;
    await db.query(
      'INSERT INTO "Race"(id,name,city,state,date,distances,organizer,status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())',
      [raceId, meta.name.slice(0,200), meta.city, meta.state, dateStr, dist, 'GlobalCronometragem', 'completed']
    );
  }

  // Inserir atletas
  for (let i = 0; i < allAthletes.length; i += 100) {
    const chunk = allAthletes.slice(i, i + 100);
    const vals = chunk.map((a, j) => {
      const id = `gc_${(Date.now()+i+j).toString(36)}${j}`;
      const g = a.gender === 'F' ? "'F'" : a.gender === 'M' ? "'M'" : 'NULL';
      return `('${id}','${esc(a.name)}',${g},'SP',NULL,NULL,1,0,NOW(),NOW())`;
    });
    await db.query('INSERT INTO "Athlete"(id,name,gender,state,age,"birthDate","totalRaces","totalPoints","createdAt","updatedAt") VALUES ' + vals.join(',') + ' ON CONFLICT DO NOTHING');
  }

  // Buscar IDs
  const names = [...new Set(allAthletes.map(a => a.name).filter(Boolean))];
  const athleteMap = {};
  for (let i = 0; i < names.length; i += 100) {
    const chunk = names.slice(i, i + 100);
    const ph = chunk.map((_,j)=>`$${j+1}`).join(',');
    const rows = await db.query(`SELECT id,name FROM "Athlete" WHERE name IN (${ph})`, chunk);
    for (const r of rows.rows) athleteMap[r.name] = r.id;
  }

  // Inserir resultados
  let imported = 0;
  for (const a of allAthletes) {
    const aid = athleteMap[a.name];
    if (!aid) continue;
    const id = `gcr_${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`;
    try {
      await db.query(
        'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NULL,0,NOW()) ON CONFLICT DO NOTHING',
        [id, aid, raceId, a.time, a.pace, dist, a.ageGroup, a.rank]
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
  console.log('\n=== REGENI Scraper GlobalCronometragem ===');
  if (DRY_RUN) console.log('(DRY RUN)');

  // 1. Buscar lista de eventos
  const html = await get('https://globalcronometragem.com.br/resultados');
  const slugs = parseEventSlugs(html).slice(0, LIMIT);
  console.log(`${slugs.length} eventos encontrados\n`);

  let totalImported = 0, totalEvents = 0, totalSkip = 0;

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    const eventUrl = `https://globalcronometragem.com.br/evento.php?slug=${slug}`;
    process.stdout.write(`\n[${i+1}/${slugs.length}] ${decodeSlug(slug).slice(0,40).padEnd(40)}`);

    try {
      await DELAY(500);
      const eventHtml = await get(eventUrl);
      const meta = parseEventMeta(eventHtml, slug);
      const resultLinks = parseResultLinks(eventHtml);

      process.stdout.write(` ${meta.date||'?'} [${resultLinks.length}arqs]`);

      if (!resultLinks.length) { process.stdout.write(' sem-resultado'); totalSkip++; continue; }
      if (DRY_RUN) continue;

      let evImported = 0;
      for (const link of resultLinks) {
        await DELAY(400);
        const resUrl = `https://globalcronometragem.com.br${link}`;
        const resHtml = await get(resUrl);
        const modName = parseModalityName(resHtml);
        const dist = normDist(modName || decodeSlug(slug));
        const athletes = parseAthletes(resHtml);

        process.stdout.write(`\n  [${dist}] ${athletes.length}at`);
        if (!athletes.length) continue;

        const n = await importEvent(db, meta, athletes, dist);
        if (n === -1) { process.stdout.write(' JÁ'); continue; }
        process.stdout.write(` → ${n}imp`);
        evImported += n;
      }

      totalImported += evImported;
      totalEvents++;
      await DELAY(500);
    } catch(e) {
      process.stdout.write(` ERRO: ${e.message.slice(0,50)}`);
    }
  }

  console.log('\n\n' + '='.repeat(60));
  console.log(`GLOBALCRONOMETRAGEM — ${totalImported} resultados importados`);
  console.log(`                      ${totalEvents} eventos processados`);
  console.log(`                      ${totalSkip} pulados`);

  const r = await db.query('SELECT (SELECT COUNT(*) FROM "Race") c,(SELECT COUNT(*) FROM "Result") res,(SELECT COUNT(*) FROM "Athlete") a');
  console.log(`Banco: ${r.rows[0].c} corridas | ${r.rows[0].res} resultados | ${r.rows[0].a} atletas`);
  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
