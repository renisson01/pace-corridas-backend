#!/usr/bin/env node
/**
 * REGENI — Scraper Runking (todas as empresas)
 * Descobre eventos recentes em resultados.runking.com.br e importa resultados.
 *
 * Uso:
 *   node scripts/scraper-runking.cjs                        # últimas 2 semanas, todas empresas
 *   node scripts/scraper-runking.cjs --semanas 4            # últimas 4 semanas
 *   node scripts/scraper-runking.cjs --company chronomax    # só uma empresa
 *   node scripts/scraper-runking.cjs --dry-run              # só lista eventos, não importa
 *
 * Plataforma: Runking (resultados.runking.com.br)
 * Empresas atendidas: 36 (Chronomax, o2-correbrasil, iguana-sports, vega-sports, etc.)
 */
const { Client } = require('pg');
const CryptoJS = require('crypto-js');
const https = require('https');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL não definida'); process.exit(1); }

const DELAY = ms => new Promise(r => setTimeout(r, ms));
const PER_PAGE = 20;

// ─── Lista completa de empresas no Runking ──────────────────────────────────
const EMPRESAS = [
  '3a-eventos', '5-oceans', 'a-tribuna', 'balax', 'bee-sports',
  'beta-sports', 'bex-eventos', 'braves', 'bronkos-race', 'chronomax',
  'clube-dos-corredores-de-porto-alegre', 'digitime', 'ea-run',
  'fidalgo-eventos', 'forchip', 'grupo-stc-eventos-ltda',
  'hp-cronometragem', 'ht-sports', 'iguana-sports', 'kenya', 'krono',
  'letape-brasil', 'neorace', 'noblu-sport', 'o2-correbrasil',
  'pepper-sports', 'ponto-org', 'run-sports', 'sagaz-esportes',
  'sana-sports', 'sportsland', 'vega-sports', 'wtr', 'x3m',
  'youp', 'zenite-sports',
];

// ─── Argumentos ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const SEMANAS = parseInt(getArg('--semanas') || '2');
const DRY_RUN = args.includes('--dry-run');
const COMPANY_FILTER = getArg('--company') || null;
const CUTOFF = new Date(Date.now() - SEMANAS * 7 * 24 * 3600 * 1000);

const empresasAtivas = COMPANY_FILTER ? [COMPANY_FILTER] : EMPRESAS;

console.log(`\n=== REGENI Scraper Runking ===`);
console.log(`Empresas: ${empresasAtivas.length} | Janela: últimas ${SEMANAS} semanas (>= ${CUTOFF.toISOString().slice(0, 10)})`);
if (COMPANY_FILTER) console.log(`Filtro: ${COMPANY_FILTER}`);
if (DRY_RUN) console.log('(DRY RUN — sem importação)');

// ─── HTTP helpers ───────────────────────────────────────────────────────────
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 Chrome/120',
        'Accept': 'text/html,*/*',
        ...headers,
      },
      timeout: 30000,
    }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        return httpsGet(res.headers.location, headers).then(resolve).catch(reject);
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ─── Decrypt Runking AES ────────────────────────────────────────────────────
function decryptBlocks(html, key) {
  const enc = html.match(/U2FsdGVkX1[A-Za-z0-9+/=]{20,}/g) || [];
  const results = [];
  for (const block of enc) {
    try {
      const dec = CryptoJS.AES.decrypt(block, key).toString(CryptoJS.enc.Utf8);
      if (!dec || dec.length < 10) continue;
      results.push(JSON.parse(dec));
    } catch (_) {}
  }
  return results;
}

function findAthleteData(blocks) {
  for (const b of blocks) {
    if (Array.isArray(b) && b.length > 0 && b[0].id && b[0].generalPlacement !== undefined) return b;
  }
  return null;
}

function findStats(blocks) {
  for (const b of blocks) {
    if (b && b.modality && Array.isArray(b.modality)) return b;
  }
  return null;
}

// ─── Parse RSC de uma empresa → lista de eventos ────────────────────────────
function parseRscEvents(body, companySlug) {
  const companyMap = {}; // id → slug
  const eventList = [];
  const lineRe = /^[0-9a-f]+:(\{.+\})$/;
  for (const line of body.split('\n')) {
    const m = line.match(lineRe);
    if (!m) continue;
    try {
      const obj = JSON.parse(m[1]);
      if (obj.fantasyName && obj.slug && obj.id && !obj.companysId) {
        companyMap[obj.id] = obj.slug;
      } else if (obj.companysId && obj.slug && obj.name) {
        eventList.push({ companysId: obj.companysId, eventSlug: obj.slug, name: obj.name });
      }
    } catch (_) {}
  }
  // Se o RSC não retornou companyMap (empresa com só 1 nível), usa o slug direto
  const resolved = [];
  for (const ev of eventList) {
    const slug = companyMap[ev.companysId] || companySlug;
    resolved.push({ companySlug: slug, eventSlug: ev.eventSlug, name: ev.name });
  }
  return resolved;
}

// ─── Descoberta de eventos via RSC — todas as empresas ──────────────────────
async function discoverEvents() {
  console.log(`\n[Descoberta] Varrendo ${empresasAtivas.length} empresas...`);
  const allEvents = [];
  const seen = new Set();

  for (let i = 0; i < empresasAtivas.length; i++) {
    const slug = empresasAtivas[i];
    process.stdout.write(`  [${i + 1}/${empresasAtivas.length}] ${slug.padEnd(38)}`);
    try {
      await DELAY(400);
      const { body } = await httpsGet(
        `https://resultados.runking.com.br/${slug}/resultados`,
        { 'RSC': '1' }
      );
      const events = parseRscEvents(body, slug);
      let novos = 0;
      for (const ev of events) {
        const key = `${ev.companySlug}/${ev.eventSlug}`;
        if (!seen.has(key)) { seen.add(key); allEvents.push(ev); novos++; }
      }
      process.stdout.write(`${events.length} eventos (+${novos} novos)\n`);
    } catch (e) {
      process.stdout.write(`ERRO: ${e.message.slice(0, 40)}\n`);
    }
  }

  console.log(`\n  → ${allEvents.length} eventos totais descobertos`);
  return allEvents;
}

// ─── Metadata do evento ─────────────────────────────────────────────────────
async function getEventMeta(companySlug, eventSlug) {
  const url = `https://resultados.runking.com.br/${companySlug}/${eventSlug}`;
  const { body } = await httpsGet(url, { 'RSC': '1' });

  // Campos novos: mainDate (ISO), eventName ou name no objeto evento
  // Campos legados: eventMainDate (timestamp), eventCity, eventUF
  const nameMatch = body.match(/"eventName":"([^"]+)"/) ||
                    body.match(/"name":"((?!viewport|description|keywords|robots)[A-Za-z][^"]{3,})"/)  ;
  const dateMatch = body.match(/"mainDate":"([^"]+)"/) ||
                    body.match(/"startTime":"([^"]+)"/) ||
                    body.match(/"eventMainDate":(\d+)/);
  const cityMatch = body.match(/"eventCity":"([^"]+)"/);
  const ufMatch   = body.match(/"eventUF":"([^"]+)"/);

  let date = null;
  if (dateMatch) {
    const v = dateMatch[1];
    date = /^\d+$/.test(v) ? new Date(parseInt(v)) : new Date(v);
  }

  // Extrair modalidades dos objetos RSC (distance field nos objetos de modalidade)
  const modalities = [];
  const modRe = /"code":"([^"]+)","name":"[^"]+","map":"[^"]*","mapParse"/g;
  let mm;
  while ((mm = modRe.exec(body)) !== null) {
    if (!modalities.includes(mm[1])) modalities.push(mm[1]);
  }

  // Fallback: usar AES decrypt para stats
  if (!modalities.length) {
    const statsKey = `${eventSlug}CIPHER$#`;
    const blocks = decryptBlocks(body, statsKey);
    const stats = findStats(blocks);
    if (stats) stats.modality.forEach(m => modalities.push(m.modality));
  }

  // Extrair nome do evento pelo slug
  let nome = eventSlug;
  const evObjRe = new RegExp('"slug":"' + eventSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^}]{0,200}"name":"([^"]+)"');
  const evObjMatch = body.match(evObjRe);
  if (evObjMatch) nome = evObjMatch[1];
  else if (nameMatch) nome = nameMatch[1];

  return {
    name: nome,
    date,
    city: cityMatch ? cityMatch[1] : 'Brasil',
    state: ufMatch ? ufMatch[1] : 'XX',
    modalities,
  };
}

// ─── Scrape resultados de uma modalidade ────────────────────────────────────
async function scrapeModality(companySlug, eventSlug, modality) {
  const key = `${eventSlug}CIPHER$#`;
  const athletes = [];
  const seen = new Set();

  for (const gender of ['M', 'F']) {
    let page = 1;
    let emptyCount = 0;
    while (true) {
      const url = `https://resultados.runking.com.br/${companySlug}/${eventSlug}` +
        `?modality=${encodeURIComponent(modality)}&page=${page}&gender=${gender}&category=`;
      process.stdout.write(` ${gender}p${page}`);
      try {
        const { body } = await httpsGet(url);
        const blocks = decryptBlocks(body, key);
        const list = findAthleteData(blocks);
        if (!list || list.length === 0) {
          emptyCount++;
          if (emptyCount >= 2) break;
          page++;
          await DELAY(600);
          continue;
        }
        emptyCount = 0;
        for (const a of list) {
          if (!seen.has(a.id)) { seen.add(a.id); athletes.push(a); }
        }
        if (list.length < PER_PAGE) break;
        page++;
      } catch (e) {
        process.stdout.write(`(ERR:${e.message.slice(0, 20)})`);
        break;
      }
      await DELAY(600);
    }
  }
  return athletes;
}

// ─── Utils ──────────────────────────────────────────────────────────────────
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
  // t pode ser "02:30:00" ou "01:23:45.12" ou ms
  const p = String(t).split(':');
  if (p.length >= 3) {
    const h = parseInt(p[0]), m = parseInt(p[1]), s = Math.floor(parseFloat(p[2]));
    if (isNaN(h) || isNaN(m) || isNaN(s)) return null;
    if (!h && !m && !s) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return null;
}

function calcPace(time, km) {
  if (!time || !km) return null;
  const [h, m, s] = time.split(':').map(Number);
  const sec = h * 3600 + m * 60 + s;
  if (!sec) return null;
  const ps = sec / km;
  return Math.floor(ps / 60) + ':' + String(Math.round(ps % 60)).padStart(2, '0');
}

function esc(s) { return String(s || '').replace(/'/g, "''"); }

// ─── Importar evento para o banco ───────────────────────────────────────────
async function importEvent(db, companySlug, eventSlug, meta, allAthletes) {
  const totalR = allAthletes.length;
  if (!totalR) return 0;

  const distLabels = [...new Set(allAthletes.map(a => normDist(a._mod || a.modality || '5K')))];
  const distStr = distLabels.join(',') || '5K';
  const dateStr = meta.date ? meta.date.toISOString().slice(0, 10) : '2026-01-01';

  // Verificar se já existe
  const ex = await db.query(
    'SELECT id FROM "Race" WHERE name ILIKE $1 AND "organizer"=\'Runking\' LIMIT 1',
    ['%' + meta.name.slice(0, 25) + '%']
  );
  let raceId;
  if (ex.rows.length) {
    raceId = ex.rows[0].id;
    const chk = await db.query('SELECT COUNT(*) c FROM "Result" WHERE "raceId"=$1', [raceId]);
    if (parseInt(chk.rows[0].c) > 0) {
      process.stdout.write(' JÁ_EXISTE');
      return -1;
    }
  } else {
    raceId = `rk_${Date.now().toString(36)}`;
    await db.query(
      'INSERT INTO "Race"(id,name,city,state,date,distances,organizer,status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())',
      [raceId, meta.name.slice(0, 200), meta.city, meta.state, dateStr, distStr, 'Runking', 'completed']
    );
  }

  // Inserir atletas em lote
  for (let i = 0; i < allAthletes.length; i += 100) {
    const chunk = allAthletes.slice(i, i + 100);
    const vals = chunk.map((a, j) => {
      const id = `rk_${(Date.now() + i + j).toString(36)}${j}`;
      const name = (a.name || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 200);
      if (!name || name.length < 2) return null;
      const g = a.gender === 'F' ? "'F'" : a.gender === 'M' ? "'M'" : 'NULL';
      const st = a.state ? `'${esc(String(a.state).slice(0, 2).toUpperCase())}'` : 'NULL';
      return `('${id}','${esc(name)}',${g},${st},NULL,NULL,1,0,NOW(),NOW())`;
    }).filter(Boolean);
    if (!vals.length) continue;
    await db.query(
      'INSERT INTO "Athlete"(id,name,gender,state,age,"birthDate","totalRaces","totalPoints","createdAt","updatedAt") VALUES ' +
      vals.join(',') + ' ON CONFLICT DO NOTHING'
    );
  }

  // Buscar IDs dos atletas
  const names = [...new Set(allAthletes.map(a => (a.name || '').trim().toUpperCase().replace(/\s+/g, ' ')).filter(Boolean))];
  const athleteMap = {};
  for (let i = 0; i < names.length; i += 100) {
    const chunk = names.slice(i, i + 100);
    const ph = chunk.map((_, j) => `$${j + 1}`).join(',');
    const rows = await db.query(`SELECT id,name FROM "Athlete" WHERE name IN (${ph})`, chunk);
    for (const r of rows.rows) athleteMap[r.name] = r.id;
  }

  // Inserir resultados
  let imported = 0;
  for (const a of allAthletes) {
    const name = (a.name || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const aid = athleteMap[name];
    if (!aid) continue;
    const rawTime = a.liquidTime || a.rawTime || a.time || a.finishTime || a.chipTime;
    const time = fmtTime(rawTime);
    if (!time) continue;
    const dist = normDist(a._mod || a.modality || '5K');
    const km = distKm(dist);
    const pace = calcPace(time, km);
    const id = `rkr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    try {
      await db.query(
        'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,0,NOW()) ON CONFLICT DO NOTHING',
        [id, aid, raceId, time, pace, dist, a.categoryName || null, a.generalPlacement || null, a.genderPlacement || null]
      );
      imported++;
    } catch (_) {}
  }

  return imported;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  console.log('Conectado ao banco!\n');

  let totalImported = 0;
  let totalSkip = 0;
  let totalEvents = 0;

  // 1. Descobrir eventos
  const events = await discoverEvents();

  // 2. Para cada evento: verificar data e importar
  for (const ev of events) {
    const { companySlug, eventSlug, name } = ev;
    process.stdout.write(`\n[${++totalEvents}/${events.length}] [${companySlug}] ${name.slice(0, 30).padEnd(30)}`);

    try {
      // Checar se já existe no banco
      const ex = await db.query(
        'SELECT id FROM "Race" WHERE name ILIKE $1 AND organizer=\'Runking\' LIMIT 1',
        ['%' + name.slice(0, 25) + '%']
      );
      if (ex.rows.length) {
        const chk = await db.query('SELECT COUNT(*) c FROM "Result" WHERE "raceId"=$1', [ex.rows[0].id]);
        if (parseInt(chk.rows[0].c) > 0) {
          process.stdout.write(' skip(já importado)');
          totalSkip++;
          continue;
        }
      }

      // Buscar metadata para verificar data
      await DELAY(300);
      const meta = await getEventMeta(companySlug, eventSlug);

      if (!meta.date) {
        process.stdout.write(' skip(sem data)');
        totalSkip++;
        continue;
      }

      // Verificar janela de tempo: só eventos das últimas SEMANAS semanas e já acontecidos
      const now = new Date();
      if (meta.date > now) {
        process.stdout.write(` skip(futuro: ${meta.date.toISOString().slice(0, 10)})`);
        totalSkip++;
        continue;
      }
      if (meta.date < CUTOFF) {
        process.stdout.write(` skip(muito antigo: ${meta.date.toISOString().slice(0, 10)})`);
        totalSkip++;
        continue;
      }

      process.stdout.write(` ${meta.date.toISOString().slice(0, 10)} ${meta.city}/${meta.state}`);

      if (DRY_RUN) {
        process.stdout.write(' (dry-run)');
        continue;
      }

      // Determinar modalidades
      let modalities = meta.modalities;
      if (!modalities.length) modalities = [''];

      // Scrape todas modalidades
      const allAthletes = [];
      for (const mod of modalities) {
        process.stdout.write(`\n  [${mod || 'DEFAULT'}]`);
        const aths = await scrapeModality(companySlug, eventSlug, mod);
        for (const a of aths) allAthletes.push({ ...a, _mod: mod });
        process.stdout.write(` = ${aths.length}`);
        await DELAY(500);
      }

      process.stdout.write(`\n  Total: ${allAthletes.length} atletas`);

      const n = await importEvent(db, companySlug, eventSlug, meta, allAthletes);
      if (n === -1) { totalSkip++; continue; }
      process.stdout.write(` → ${n} importados`);
      totalImported += n;

      await DELAY(1000);
    } catch (e) {
      process.stdout.write(` ERRO: ${e.message.slice(0, 50)}`);
    }
  }

  // Resumo
  console.log('\n\n' + '='.repeat(60));
  console.log(`RUNKING — ${totalImported} resultados importados`);
  console.log(`           ${totalSkip} eventos pulados`);
  console.log(`           ${totalEvents} eventos verificados`);

  const r = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM "Race") corridas,
      (SELECT COUNT(*) FROM "Result") resultados
  `);
  console.log(`Banco: ${r.rows[0].corridas} corridas | ${r.rows[0].resultados} resultados`);

  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
