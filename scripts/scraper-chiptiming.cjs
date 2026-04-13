#!/usr/bin/env node
/**
 * REGENI — Scraper ChipTiming (sem Puppeteer)
 * Usa Bearer token hardcoded + fetch direto do Node para admin.chiptiming.com.br
 *
 * Estratégia:
 *   1. Busca HTML da página do evento para extrair __NEXT_DATA__ (metadados + list IDs)
 *   2. Para cada lista, chama admin API com Bearer token e pagina
 *   3. Importa no banco PostgreSQL
 *
 * Uso:
 *   DATABASE_URL=... node scripts/scraper-chiptiming.cjs --ano 2026 --evento maratonafortaleza2026
 *   DATABASE_URL=... node scripts/scraper-chiptiming.cjs --url https://eventos.chiptiming.com.br/resultados/2026/maratonafortaleza2026
 *   DATABASE_URL=... node scripts/scraper-chiptiming.cjs --ano 2026 --evento maratonafortaleza2026 --dry-run
 */

const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL não definida'); process.exit(1); }

const DELAY = ms => new Promise(r => setTimeout(r, ms));
const BEARER = 'Bearer JgECf44XYsLdNY57m6K9WbLM62GNJhv6HbJ5AgRE6GfOrr0w4xhEiF3Cok0j8Xrz';
const ADMIN_BASE = 'https://admin.chiptiming.com.br/api/v2';
const PAGE_SIZE = 50; // API limita a 50 por página

// ─── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const ANO = getArg('--ano') || '2026';
const SLUG = getArg('--evento');
const URL_ARG = getArg('--url');
const DRY_RUN = args.includes('--dry-run');

if (!SLUG && !URL_ARG) {
  console.error('Uso: node scraper-chiptiming.cjs --ano 2026 --evento maratonafortaleza2026');
  console.error('  ou: node scraper-chiptiming.cjs --url https://eventos.chiptiming.com.br/resultados/2026/maratonafortaleza2026');
  process.exit(1);
}

const EVENT_URL = URL_ARG || `https://eventos.chiptiming.com.br/resultados/${ANO}/${SLUG}`;

// ─── Utils ────────────────────────────────────────────────────────────────────
function normDist(d) {
  const n = parseFloat(String(d || '5').replace(/[^0-9.]/g, ''));
  if (n >= 40) return '42K'; if (n >= 20) return '21K'; if (n >= 14) return '15K';
  if (n >= 12) return '12K'; if (n >= 9) return '10K'; if (n >= 7.5) return '8K';
  if (n >= 6.5) return '7K'; if (n >= 5.5) return '6K'; if (n >= 4) return '5K'; return '3K';
}
function distKm(d) {
  return { '42K': 42, '21K': 21, '15K': 15, '12K': 12, '10K': 10, '8K': 8, '7K': 7, '6K': 6, '5K': 5, '3K': 3 }[d] || null;
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

// ─── Fetch com Bearer ─────────────────────────────────────────────────────────
async function apiGet(url) {
  const res = await fetch(url, {
    headers: {
      'Authorization': BEARER,
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} para ${url}`);
  return res.json();
}

// ─── Extrair metadados da página ──────────────────────────────────────────────
async function fetchEventMeta(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} para ${url}`);
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
  if (!m) throw new Error('__NEXT_DATA__ não encontrado no HTML');
  const data = JSON.parse(m[1]);
  return data?.props?.pageProps;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`=== ChipTiming Scraper (via Bearer) ===`);
  console.log(`URL: ${EVENT_URL}\n`);

  // 1. Metadados do evento
  console.log('[1/4] Buscando metadados do evento...');
  const pageProps = await fetchEventMeta(EVENT_URL);
  const eventMeta = pageProps?.event;
  const resultLists = (pageProps?.results || []).filter(l => !l.isFile && l.showLists);

  if (!eventMeta) {
    console.error('Não foi possível extrair metadados. URL correta?');
    process.exit(1);
  }

  const eventCode = eventMeta.code;
  const nome = eventMeta.officialName || SLUG;
  const city = eventMeta.city || '';
  const state = eventMeta.state || 'CE';
  const date = (eventMeta.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);

  console.log(`  Evento: ${nome}`);
  console.log(`  Local: ${city}/${state} | Data: ${date} | eventCode: ${eventCode}`);
  console.log(`  Listas: ${resultLists.length}`);

  // 2. Buscar entries de cada lista
  console.log('\n[2/4] Coletando resultados de cada modalidade...');
  const dataMap = {};

  for (const lista of resultLists) {
    const listId = String(lista.id);
    const mod = lista.modality?.code || '?';
    const tipo = lista.type?.code || '?';
    const dist = normDist(lista.modality?.distance || mod);
    process.stdout.write(`  [${mod} / ${tipo}] `);

    try {
      const first = await apiGet(`${ADMIN_BASE}/events/${eventCode}/results/${listId}/entries?pageSize=${PAGE_SIZE}&startPage=0`);
      const total = first.totalCount || 0;
      let allEntries = first.entries || [];
      process.stdout.write(`total=${total} `);

      if (total === 0 || !allEntries.length) {
        console.log('sem dados');
        continue;
      }

      // Paginar se necessário
      let startPage = 1;
      while (allEntries.length < total && startPage < 100) {
        const page = await apiGet(`${ADMIN_BASE}/events/${eventCode}/results/${listId}/entries?pageSize=${PAGE_SIZE}&startPage=${startPage}`);
        const more = page.entries || [];
        if (!more.length) break;
        allEntries.push(...more);
        process.stdout.write(`\r  [${mod} / ${tipo}] coletando ${allEntries.length}/${total}...`);
        startPage++;
        await DELAY(300);
      }

      if (allEntries.length >= total) {
        process.stdout.write(`\r  [${mod} / ${tipo}] total=${total} → ${allEntries.length} entries\n`);
      } else {
        console.log(`→ ${allEntries.length} entries`);
      }

      dataMap[listId] = { entries: allEntries, total, dist, mod, tipo };
    } catch (e) {
      console.log(`ERRO: ${e.message.slice(0, 80)}`);
    }
    await DELAY(500);
  }

  // 3. Resumo
  console.log('\n[3/4] Resumo da coleta:');
  let grandTotal = 0;
  for (const [lid, d] of Object.entries(dataMap)) {
    console.log(`  ${d.mod} / ${d.tipo}: ${d.entries.length} entries (${d.dist})`);
    grandTotal += d.entries.length;
  }
  console.log(`  TOTAL: ${grandTotal} atletas`);

  if (grandTotal === 0) {
    console.error('\nNenhum dado coletado.');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Dados coletados mas não importados. OK!');
    process.exit(0);
  }

  // 4. Importar para o banco
  console.log('\n[4/4] Importando para o banco...');
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  console.log('Conectado!');

  const distSet = new Set(Object.values(dataMap).map(d => d.dist));

  // Verificar/criar corrida
  const ex = await db.query(
    'SELECT id FROM "Race" WHERE name ILIKE $1 LIMIT 1',
    ['%' + nome.slice(0, 25) + '%']
  );

  let raceId;
  if (ex.rows.length) {
    raceId = ex.rows[0].id;
    const chk = await db.query('SELECT COUNT(*) c FROM "Result" WHERE "raceId"=$1', [raceId]);
    if (parseInt(chk.rows[0].c) > 0) {
      console.log(`Corrida já importada (${chk.rows[0].c} resultados). Pulando.`);
      await db.end();
      process.exit(0);
    }
    await db.query('UPDATE "Race" SET distances=$1 WHERE id=$2', [[...distSet].join(','), raceId]);
    console.log(`  Corrida existente: ${raceId}`);
  } else {
    raceId = `ct_${Date.now().toString(36)}`;
    await db.query(
      'INSERT INTO "Race"(id,name,city,state,date,distances,organizer,status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())',
      [raceId, nome, city, state, date, [...distSet].join(',') || '5K,10K,21K,42K', 'ChipTiming', 'completed']
    );
    console.log(`  Corrida criada: ${raceId} — ${nome}`);
  }

  // Montar lista completa de atletas válidos
  const todos = [];
  for (const [listId, d] of Object.entries(dataMap)) {
    const genderCode = d.tipo.startsWith('Female') ? 'F' : d.tipo.startsWith('Male') ? 'M' : null;
    const km = distKm(d.dist);
    for (const entry of d.entries) {
      const name = (entry.name || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 200);
      if (!name || name.length < 2) continue;
      const rawTime = entry.netTime || entry.time;
      const time = fmtTime(rawTime);
      if (!time) continue;
      todos.push({
        name,
        gender: entry.gender === 'F' ? 'F' : entry.gender === 'M' ? 'M' : genderCode,
        time,
        pace: calcPace(time, km),
        dist: d.dist,
        age: entry.age || null,
        ageGroup: entry.ageGroup || null,
        overallRank: entry.place || null,
        ageGroupRank: entry.ageGroupPlace || null,
      });
    }
  }

  console.log(`  ${todos.length} registros válidos para importar`);

  // INSERT atletas em lotes de 200
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
    process.stdout.write(`\r  Atletas: ${Math.min(i + 200, todos.length)}/${todos.length}`);
  }
  console.log('');

  // Buscar IDs dos atletas inseridos
  const names = [...new Set(todos.map(a => a.name))];
  const athleteMap = {};
  for (let i = 0; i < names.length; i += 200) {
    const chunk = names.slice(i, i + 200);
    const ph = chunk.map((_, j) => `$${j + 1}`).join(',');
    const rows = await db.query(`SELECT id,name FROM "Athlete" WHERE name IN (${ph})`, chunk);
    for (const r of rows.rows) athleteMap[r.name] = r.id;
  }

  // INSERT resultados em lotes
  let imported = 0;
  for (let i = 0; i < todos.length; i += 200) {
    const chunk = todos.slice(i, i + 200);
    const vals = [];
    for (const a of chunk) {
      const aid = athleteMap[a.name];
      if (!aid) continue;
      const id = `ctr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const pace = a.pace ? `'${a.pace}'` : 'NULL';
      const ag = a.ageGroup ? `'${esc(a.ageGroup)}'` : 'NULL';
      const or_ = a.overallRank || 'NULL';
      const agr = a.ageGroupRank || 'NULL';
      vals.push(`('${id}','${aid}','${raceId}','${a.time}',${pace},'${a.dist}',${ag},${or_},${agr},0,NOW())`);
    }
    if (!vals.length) continue;
    try {
      await db.query(
        'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt") VALUES ' +
        vals.join(',') + ' ON CONFLICT DO NOTHING'
      );
      imported += vals.length;
    } catch (e) {
      // Fallback individual
      for (const a of chunk) {
        const aid = athleteMap[a.name];
        if (!aid) continue;
        const id = `ctr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
        try {
          await db.query(
            'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,0,NOW()) ON CONFLICT DO NOTHING',
            [id, aid, raceId, a.time, a.pace, a.dist, a.ageGroup, a.overallRank, a.ageGroupRank]
          );
          imported++;
        } catch (_) {}
      }
    }
    process.stdout.write(`\r  Resultados: ${imported}/${todos.length}`);
  }
  console.log(`\n  Importados: ${imported}/${todos.length}`);

  const totais = await db.query('SELECT (SELECT COUNT(*) FROM "Race") c,(SELECT COUNT(*) FROM "Athlete") a,(SELECT COUNT(*) FROM "Result") res');
  console.log(`\nBanco: ${totais.rows[0].c} corridas | ${totais.rows[0].a} atletas | ${totais.rows[0].res} resultados`);

  await db.end();
  console.log(`\n✅ ${nome}: ${imported} resultados importados`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
