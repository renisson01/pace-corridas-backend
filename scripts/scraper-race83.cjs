#!/usr/bin/env node
/**
 * REGENI — Race83 Scraper (Wiclax/CLAX format)
 * Same XML format as ChipPower but from race83.com.br
 * 
 * Usage:
 *   node scraper-race83.cjs --list
 *   node scraper-race83.cjs --all
 *   node scraper-race83.cjs --event "evento/2025/EVENT/EVENT.clax" --dry
 */

const https = require('https');
const { XMLParser } = require('fast-xml-parser');
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:sBbOLYIKlSXCXTnLWnYRUTJVAzLUBhhF@caboose.proxy.rlwy.net:31475/railway';
const RACE83_BASE = 'https://race83.com.br/resultados/';
const RACE83_INDEX = 'https://race83.com.br/resultados/';
const DRY = process.argv.includes('--dry');
const DELAY = ms => new Promise(r => setTimeout(r, ms));

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'REGENI/1.0' }, timeout: 30000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return fetch(res.headers.location).then(resolve).catch(reject);
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); res.on('error', reject);
    }).on('error', reject);
  });
}

function parseTime(raw) {
  if (!raw) return null;
  const m = raw.match(/(\d+)h(\d+)'(\d+)/);
  if (m) return `${m[1].padStart(2,'0')}:${m[2].padStart(2,'0')}:${m[3].padStart(2,'0')}`;
  const m2 = raw.match(/(\d+):(\d+):(\d+)/);
  if (m2) return raw.substring(0,8);
  return raw;
}

function timeToSec(t) {
  if (!t) return 999999;
  const p = t.split(':').map(Number);
  return p.length === 3 ? p[0]*3600+p[1]*60+p[2] : p[0]*60+p[1];
}

function normDist(raw) {
  if (!raw) return '';
  const l = raw.toLowerCase().replace(/\s+/g,'');
  if (l.includes('42k')||l.includes('maratona')) return '42km';
  if (l.includes('21k')||l.includes('meia')) return '21km';
  if (l.includes('15k')) return '15km';
  if (l.includes('10k')) return '10km';
  if (l.includes('5k')) return '5km';
  if (l.includes('3k')) return '3km';
  const n = raw.match(/([\d.]+)\s*k/i);
  return n ? n[1]+'km' : raw;
}

function calcPace(time, distKm) {
  if (!time||!distKm) return '';
  const s = timeToSec(time), km = parseFloat(distKm);
  if (!km) return '';
  const ps = s/km, min = Math.floor(ps/60), sec = Math.round(ps%60);
  return `${min}:${String(sec).padStart(2,'0')}`;
}

function ageGroup(age) {
  if (!age||age<0||age>120) return 'Geral';
  if (age<20) return 'Sub-20';
  if (age<30) return '20-29';
  if (age<40) return '30-39';
  if (age<50) return '40-49';
  if (age<60) return '50-59';
  return '60+';
}

function parseDate(s) {
  const months = {janeiro:'01',fevereiro:'02','março':'03',marco:'03',abril:'04',maio:'05',junho:'06',julho:'07',agosto:'08',setembro:'09',outubro:'10',novembro:'11',dezembro:'12'};
  const m = s?.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/);
  if (m) return `${m[3]}-${months[m[2].toLowerCase()]||'01'}-${m[1].padStart(2,'0')}`;
  return new Date().toISOString().split('T')[0];
}

async function listEvents() {
  console.log('📡 Fetching Race83 event list...');
  const html = await fetch(RACE83_INDEX);
  // Extract clax URLs from the page
  const urls = [...html.matchAll(/(?:href|url|f)=["']?([^"'\s]*\.clax)/gi)]
    .map(m => m[1].replace(/\\\//g,'/'));
  
  // Also try g-live.html?f= pattern
  const urls2 = [...html.matchAll(/g-live\.html\?f=([^"\\&\s]*)/g)]
    .map(m => m[1].replace(/\\\//g,'/'));
  
  const all = [...new Set([...urls, ...urls2])];
  return all;
}

async function parseClax(path) {
  const url = path.startsWith('http') ? path : RACE83_BASE + path;
  console.log(`📡 ${url}`);
  let xml;
  try { xml = await fetch(url); } catch(e) { console.log(`  ❌ ${e.message}`); return null; }
  
  const doc = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:'' }).parse(xml);
  const ep = doc.Epreuve;
  if (!ep) { console.log('  ❌ Invalid CLAX'); return null; }

  const name = (ep.nom||'').trim();
  const dates = ep.dates||'';
  const org = ep.organisateur||'';
  const stM = org.match(/(BA|SE|PE|AL|CE|RN|PB|PI|MA|MG|SP|RJ|PR|RS|SC|GO|MT|MS|ES|DF|TO|RO|AC|AM|PA|AP|RR)\s*$/i);
  const state = stM ? stM[1].toUpperCase() : 'PB';
  const cityM = org.match(/[-–]\s*([^-–]+?)\s*(?:BA|SE|PE|AL|CE|RN|PB|PI|MA|MG|SP|RJ|PR|RS|SC|GO|MT|MS|ES|DF|TO|RO|AC|AM|PA|AP|RR)\s*$/i);
  const city = cityM ? cityM[1].trim() : '';

  const etapes = ep.Etapes?.Etape;
  const etArr = Array.isArray(etapes) ? etapes : etapes ? [etapes] : [];
  let engages = [], results = [];
  for (const et of etArr) {
    const e = et.Engages?.E; engages.push(...(Array.isArray(e)?e:e?[e]:[]));
    const r = et.Resultats?.R; results.push(...(Array.isArray(r)?r:r?[r]:[]));
  }

  const aMap = {};
  for (const e of engages) aMap[String(e.d)] = { name:(e.n||'').trim(), gender:(e.x||'').toUpperCase()==='F'?'F':'M', year:parseInt(e.a)||null, age:e.a?(new Date().getFullYear()-parseInt(e.a)):null, mod:(e.p||'').trim(), dist:normDist(e.ip1||e.p||'') };
  const rMap = {};
  for (const r of results) rMap[String(r.d)] = { time:parseTime(r.t), timeReal:parseTime(r.re) };

  const merged = [];
  for (const [d,a] of Object.entries(aMap)) {
    const r = rMap[d]; if (!r) continue;
    if (a.mod.toUpperCase().includes('DESCLASS')) continue;
    merged.push({ ...a, time:r.timeReal||r.time, dist:a.dist });
  }

  const dists = [...new Set(merged.map(r=>r.dist))].filter(d=>d&&d.toUpperCase()!=='TROCA');
  const grouped = {};
  for (const dist of dists) {
    grouped[dist] = merged.filter(r=>r.dist===dist).sort((a,b)=>timeToSec(a.time)-timeToSec(b.time)).map((r,i)=>({...r,rank:i+1}));
  }

  return { name, dates, city, state, org, dists, grouped, total:merged.length, source:'race83', url };
}

async function importEvent(data) {
  if (!data) return {ok:0,err:0};
  console.log(`  🏁 ${data.name} | ${data.city} ${data.state} | ${data.total} finishers | ${data.dists.join(', ')}`);
  if (DRY) return {ok:0,err:0};

  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  // Find or create race
  const raceId = 'race83_' + data.name.replace(/[^a-zA-Z0-9]/g,'').toLowerCase().substring(0,40);
  await client.query(`INSERT INTO "Race"(id,name,date,city,state,distances,organizer,status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,'completed',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`,
    [raceId, data.name, parseDate(data.dates), data.city, data.state, data.dists.join(','), data.org||'Race83']);

  let ok = 0, err = 0;
  for (const [dist, results] of Object.entries(data.grouped)) {
    const distKm = parseFloat(dist)||0;
    for (const r of results) {
      try {
        const aid = 'r83_' + r.name.replace(/[^a-zA-Z0-9]/g,'').toLowerCase().substring(0,40);
        await client.query(`INSERT INTO "Athlete"(id,name,gender,age,state,"totalRaces","totalPoints","createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,1,0,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`,
          [aid, r.name, r.gender, r.age||0, data.state]);
        
        const rid = raceId + '_' + aid.substring(0,30) + '_' + dist.substring(0,10);
        await client.query(`INSERT INTO "Result"(id,"raceId","athleteId",time,pace,"overallRank","genderRank","ageGroup",distance,points,"createdAt") VALUES($1,$2,$3,$4,$5,$6,0,$7,$8,0,NOW()) ON CONFLICT DO NOTHING`,
          [rid, raceId, aid, r.time||'00:00:00', calcPace(r.time,distKm), r.rank||0, ageGroup(r.age), dist]);
        ok++;
      } catch(e) { err++; }
    }
    console.log(`  📏 ${dist}: ${results.length} → ${ok} ok`);
  }

  await client.end();
  return {ok, err};
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    const events = await listEvents();
    console.log(`\n🏆 ${events.length} events found on Race83:\n`);
    events.forEach((e, i) => console.log(`  ${i+1}. ${e}`));
    return;
  }

  if (args.includes('--event')) {
    const path = args[args.indexOf('--event')+1];
    const data = await parseClax(path);
    const r = await importEvent(data);
    console.log(`\n✅ Done: ${r.ok} imported, ${r.err} errors`);
    return;
  }

  if (args.includes('--all')) {
    const events = await listEvents();
    console.log(`🚀 ${events.length} events\n`);
    let totalOk=0, totalErr=0;
    for (const path of events) {
      try {
        const data = await parseClax(path);
        const r = await importEvent(data);
        totalOk += r.ok; totalErr += r.err;
      } catch(e) { console.error(`  ❌ ${e.message}`); }
      await DELAY(500);
    }
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🎉 DONE: ${totalOk} imported, ${totalErr} errors`);
    return;
  }

  console.log('Usage:\n  node scraper-race83.cjs --list\n  node scraper-race83.cjs --all [--dry]\n  node scraper-race83.cjs --event "PATH" [--dry]');
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
