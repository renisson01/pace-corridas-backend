#!/usr/bin/env node
/**
 * REGENI — Scraper Apuração de Tempos
 * Site: apuracaodetempos.com.br
 * Formato: HTML estático, tabela com classe "conteudo"
 * URL: /Resultados/{slug}/Resultados.html
 *
 * Descoberta de eventos:
 *   1. settime.com.br/resultados — lista eventos com links
 *   2. Wayback Machine CDX API — slugs históricos
 *   3. Lista hardcoded de fallback
 *
 * Uso:
 *   node scripts/scraper-apuracaodetempos.cjs             # importar tudo
 *   node scripts/scraper-apuracaodetempos.cjs --dry-run   # sem importar
 *   node scripts/scraper-apuracaodetempos.cjs --limit 3   # máx 3 eventos
 *   node scripts/scraper-apuracaodetempos.cjs --slug minha-corrida  # evento específico
 */
'use strict';

require('dotenv').config();
const { Pool }  = require('pg');
const https     = require('https');
const http      = require('http');
const cheerio   = require('cheerio');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL não definida'); process.exit(1); }

const db = new Pool({ connectionString: DB_URL, max: 3, idleTimeoutMillis: 30000 });

const args    = process.argv.slice(2);
const getArg  = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const DRY_RUN    = args.includes('--dry-run');
const LIMIT      = parseInt(getArg('--limit') || '9999');
const SLUG_ONLY  = getArg('--slug') || null;
const DELAY      = ms => new Promise(r => setTimeout(r, ms));

const ORGANIZER     = 'ApuracaoDeTempos';
const ID_PREFIX     = 'adt';
const DEFAULT_STATE = 'SP';
const BASE_URL      = 'https://www.apuracaodetempos.com.br';

// ─── HTTP ─────────────────────────────────────────────────────────────────────
function getRaw(url, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error('too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 Chrome/120',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
      timeout: 30000,
    }, res => {
      if ([301,302,307,308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return getRaw(next, depth + 1).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        body: Buffer.concat(chunks),
        headers: res.headers,
        status: res.statusCode,
      }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function getHtml(url) {
  const { body, headers, status } = await getRaw(url);
  if (status === 404 || status === 403) return null;
  // Tenta UTF-8, se falhar usa latin-1
  try {
    return { html: body.toString('utf8'), headers };
  } catch(_) {
    return { html: body.toString('latin1'), headers };
  }
}

async function getText(url) {
  const { body } = await getRaw(url);
  return body.toString('utf8');
}

// ─── Descoberta de slugs ──────────────────────────────────────────────────────
const KNOWN_SLUGS = [
  'kamaluswimrun2026',
  'angelsnesttrailrunetapadeinernojulho',
  '2corridadospoderes',
  '6corridaoficialdeitapevi',
  'circuitosidrolandia',
  'corridaevoaction',
  'ecopantanalextremomtb',
];

async function discoverSlugs() {
  const slugs = new Set(KNOWN_SLUGS);

  // 1. settime.com.br
  try {
    const { html } = await getHtml('https://settime.com.br/resultados');
    const matches = html.match(/apuracaodetempos\.com\.br\/Resultados\/([^/"'\s<>]+)/g) || [];
    for (const m of matches) {
      const slug = m.split('/Resultados/')[1].split('/')[0];
      if (slug) slugs.add(slug);
    }
  } catch(_) {}

  // 2. Wayback Machine CDX
  try {
    const cdx = await getText(
      'http://web.archive.org/cdx/search/cdx?url=apuracaodetempos.com.br/Resultados/*/Resultados.html&output=json&fl=original&collapse=urlkey&limit=500'
    );
    const data = JSON.parse(cdx);
    for (const row of data.slice(1)) {
      const url = row[0];
      const m = url.match(/\/Resultados\/([^/]+)\/Resultados/);
      if (m && m[1]) slugs.add(m[1]);
    }
  } catch(_) {}

  return [...slugs];
}

// ─── Normalização ─────────────────────────────────────────────────────────────
const DIST_MAP = { '42K':42,'21K':21,'15K':15,'12K':12,'10K':10,'8K':8,'7K':7,'6K':6,'5K':5,'3K':3 };

function normDist(str) {
  if (!str) return '5K';
  const up = str.toUpperCase();
  if (/42\s*K|MARAT/.test(up)) return '42K';
  if (/21\s*K|MEIA/.test(up))  return '21K';
  if (/15\s*K/.test(up))       return '15K';
  if (/12\s*K/.test(up))       return '12K';
  if (/10\s*K|11\s*K/.test(up)) return '10K';
  if (/8\s*K/.test(up))        return '8K';
  if (/7\s*K/.test(up))        return '7K';
  if (/6\s*K/.test(up))        return '6K';
  if (/5\s*K/.test(up))        return '5K';
  if (/3\s*K/.test(up))        return '3K';
  if (/LONGO|LONG/.test(up))   return '21K'; // estimativa para "percurso longo"
  if (/CURTO|SHORT/.test(up))  return '5K';
  return '5K';
}

// Extrai gênero do header da seção: "RESULTADO 5KM FEMININO" → "F"
function sectionGender(str) {
  const up = str.toUpperCase();
  if (/FEMININ/.test(up)) return 'F';
  if (/MASCULIN/.test(up)) return 'M';
  return null;
}

// Fx.Et. → { gender, ageGroup }
// Formato: F3039, M2635, F0029, M5099, F3645 etc.
function parseFxEt(raw) {
  if (!raw || raw === '-') return { gender: null, ageGroup: raw || null };
  const m = /^([MF])(\d{4})$/i.exec(raw.trim());
  if (!m) return { gender: null, ageGroup: raw };
  const gender = m[1].toUpperCase();
  const lo = parseInt(m[2].slice(0,2));
  const hi = parseInt(m[2].slice(2,4));
  return { gender, ageGroup: `${gender}${lo}-${hi}` };
}

// Estima birthYear a partir da faixa etária e data da corrida
function estimateBirthYear(ageGroup, raceYear) {
  if (!ageGroup || !raceYear) return null;
  const m = /(\d{2})-(\d{2})/.exec(ageGroup);
  if (!m) return null;
  const lo = parseInt(m[1]), hi = parseInt(m[2]);
  const midAge = Math.round((lo + hi) / 2);
  return raceYear - midAge;
}

function calcPace(time, km) {
  if (!time || !km) return null;
  const [h,m,s] = time.split(':').map(Number);
  const sec = h*3600 + m*60 + s;
  if (!sec) return null;
  const ps = sec / km;
  return Math.floor(ps/60) + ':' + String(Math.round(ps%60)).padStart(2,'0');
}

function fmtTime(raw) {
  if (!raw) return null;
  const parts = raw.trim().split(':');
  if (parts.length !== 3) return null;
  const h = parseInt(parts[0]), m = parseInt(parts[1]), s = Math.floor(parseFloat(parts[2]));
  if (isNaN(h) || isNaN(m) || isNaN(s) || (!h && !m && !s)) return null;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function esc(s) { return String(s || '').replace(/'/g, "''"); }

// ─── Parse do HTML de resultados ──────────────────────────────────────────────
function parseResultsHtml(html, slug) {
  const $ = cheerio.load(html, { decodeEntities: false });

  const eventName = ($('h1').first().text().trim() || slug).slice(0, 200);

  const allResults = [];

  // Cada tabela .tabela-resultado é uma seção (ou tem thead com seção)
  // A seção pode estar num div .faixa-etaria antes da tabela
  // ou num td.conteudo2 dentro do thead da tabela

  $('table').each((_, table) => {
    // Tentar achar o label da seção
    let sectionLabel = '';

    // Verifica se tem td.conteudo2 (seção interna)
    const conteudo2 = $(table).find('td.conteudo2').first().text().trim();
    if (conteudo2) sectionLabel = conteudo2;

    // Fallback: div.faixa-etaria anterior
    if (!sectionLabel) {
      const prev = $(table).prev('.faixa-etaria, [class*="faixa"]');
      sectionLabel = prev.text().trim();
    }

    const sectionDist = normDist(sectionLabel);
    const sectionGend = sectionGender(sectionLabel);

    // Detectar colunas pelo th
    const headers = [];
    $(table).find('th').each((_, th) => {
      headers.push($(th).text().trim().replace(/\s+/g, ' '));
    });
    if (!headers.length) return; // sem headers = não é tabela de resultados

    // Mapear índice das colunas
    const idxColoc  = headers.findIndex(h => /Coloc/.test(h));
    const idxNome   = headers.findIndex(h => /Nome/.test(h));
    const idxFxEt   = headers.findIndex(h => /Fx\.?Et/.test(h));
    const idxTempo  = headers.findIndex(h => /^Tempo/.test(h));
    const idxLiq    = headers.findIndex(h => /Liquido|Líquido/.test(h));

    if (idxNome < 0 || idxLiq < 0) return; // tabela inválida

    // Cada TR com dados
    $(table).find('tbody tr, tr').each((_, tr) => {
      // Suporta td.conteudo (angelsnest) e td sem classe (kamalu)
      let cells = $(tr).find('td.conteudo');
      if (!cells.length) cells = $(tr).find('td:not([class*="conteudo2"])');
      if (cells.length < 5) return;

      const getText = i => i >= 0 && i < cells.length ? $(cells[i]).text().trim() : '';

      const nome   = getText(idxNome).toUpperCase().replace(/\s+/g,' ');
      if (!nome || nome.length < 2) return;

      const tempo  = fmtTime(getText(idxTempo));
      const liquid = fmtTime(getText(idxLiq));
      const time   = liquid || tempo;
      if (!time) return;

      const rank = idxColoc >= 0 ? parseInt(getText(idxColoc)) || 0 : 0;
      const rawFx = getText(idxFxEt);
      const { gender, ageGroup } = parseFxEt(rawFx);

      allResults.push({
        name: nome,
        gender: gender || sectionGend,
        ageGroup,
        time,
        grossTime: tempo,
        dist: sectionDist,
        overallRank: rank,
      });
    });
  });

  return { eventName, allResults };
}

// ─── Importar evento ──────────────────────────────────────────────────────────
async function importEvent(slug, parsed, dateStr) {
  const { eventName, allResults } = parsed;
  const name = eventName.slice(0, 200);
  const raceYear = dateStr ? parseInt(dateStr.slice(0, 4)) : new Date().getFullYear();

  // Verificar duplicata
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
    // Distância mais comum no evento
    const distCounts = {};
    for (const r of allResults) distCounts[r.dist] = (distCounts[r.dist] || 0) + 1;
    const mainDist = Object.entries(distCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || '5K';

    raceId = `${ID_PREFIX}_${Date.now().toString(36)}`;
    await db.query(
      'INSERT INTO "Race"(id,name,city,state,date,distances,organizer,status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())',
      [raceId, name, DEFAULT_STATE, DEFAULT_STATE, dateStr || '2025-01-01', mainDist, ORGANIZER, 'completed']
    );
  }

  // Preparar válidos
  const valid = allResults.filter(r => r.name.length >= 2 && r.time);
  if (!valid.length) return 0;

  // Inserir atletas
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100);
    const vals = chunk.map((a, j) => {
      const id  = `${ID_PREFIX}_${(Date.now()+i+j).toString(36)}${j}`;
      const g   = a.gender === 'F' ? "'F'" : a.gender === 'M' ? "'M'" : 'NULL';
      const by  = estimateBirthYear(a.ageGroup, raceYear);
      const age = by ? (raceYear - by) : 'NULL';
      return `('${id}','${esc(a.name)}',${g},'${DEFAULT_STATE}',${age},NULL,1,0,NOW(),NOW())`;
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
    const ph    = chunk.map((_,j) => `$${j+1}`).join(',');
    const rows  = await db.query(`SELECT id,name FROM "Athlete" WHERE name IN (${ph})`, chunk);
    for (const row of rows.rows) athleteMap[row.name] = row.id;
  }

  // Inserir resultados
  let imported = 0;
  for (const a of valid) {
    const aid = athleteMap[a.name];
    if (!aid) continue;
    const id   = `${ID_PREFIX}r_${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`;
    const pace = calcPace(a.time, DIST_MAP[a.dist] || 5);
    try {
      await db.query(
        'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt",source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,0,NOW(),$10) ON CONFLICT DO NOTHING',
        [id, aid, raceId, a.time, pace, a.dist, a.ageGroup, a.overallRank || null, null, ORGANIZER]
      );
      imported++;
    } catch(_) {}
  }
  return imported;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== REGENI Scraper Apuração de Tempos ===');
  if (DRY_RUN) console.log('(DRY RUN)');

  let slugs;
  if (SLUG_ONLY) {
    slugs = [SLUG_ONLY];
  } else {
    process.stdout.write('Descobrindo eventos...');
    slugs = await discoverSlugs();
    process.stdout.write(` ${slugs.length} encontrados\n\n`);
  }

  slugs = slugs.slice(0, LIMIT);

  let totalImported = 0, totalSkip = 0;

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    process.stdout.write(`[${i+1}/${slugs.length}] ${slug.slice(0,40).padEnd(40)}`);

    try {
      await DELAY(800);
      const url    = `${BASE_URL}/Resultados/${slug}/Resultados.html`;
      const result = await getHtml(url);

      if (!result) { process.stdout.write(' 404\n'); totalSkip++; continue; }

      const { html, headers } = result;

      // Data: tenta extrair do Last-Modified
      let dateStr = null;
      if (headers['last-modified']) {
        const d = new Date(headers['last-modified']);
        if (!isNaN(d.getTime())) {
          dateStr = d.toISOString().slice(0, 10);
        }
      }

      // Tenta detectar ano no slug: ex. kamaluswimrun2026 → 2026
      if (!dateStr) {
        const ym = slug.match(/(\d{4})/);
        if (ym) dateStr = `${ym[1]}-01-01`;
      }

      const parsed = parseResultsHtml(html, slug);
      process.stdout.write(` R:${parsed.allResults.length}`);

      if (!parsed.allResults.length) {
        process.stdout.write(' sem-resultados\n');
        totalSkip++;
        continue;
      }

      if (DRY_RUN) {
        const dists = [...new Set(parsed.allResults.map(r=>r.dist))].join(',');
        process.stdout.write(` | ${parsed.eventName.slice(0,30)} | ${dateStr || '?'} | ${dists} (dry-run)\n`);
        continue;
      }

      const n = await importEvent(slug, parsed, dateStr);
      if (n === -1) { totalSkip++; process.stdout.write('\n'); continue; }
      process.stdout.write(` → ${n}imp\n`);
      totalImported += n;

    } catch(e) {
      process.stdout.write(` ERRO: ${e.message.slice(0,50)}\n`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`APURAÇÃO DE TEMPOS TOTAL — ${totalImported} resultados importados`);

  const r = await db.query('SELECT (SELECT COUNT(*) FROM "Race") c,(SELECT COUNT(*) FROM "Result") res,(SELECT COUNT(*) FROM "Athlete") a');
  console.log(`Banco: ${r.rows[0].c} corridas | ${r.rows[0].res} resultados | ${r.rows[0].a} atletas`);
  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
