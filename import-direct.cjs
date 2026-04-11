#!/usr/bin/env node
/**
 * REGENI — ChipPower Direct DB Import
 * Bypasses the API and writes directly to PostgreSQL via Prisma
 * 
 * Usage:
 *   node import-direct.cjs --all
 *   node import-direct.cjs --event "eventos/2024/MONTESSORI-RUN/CORRIDA.clax"
 *   node import-direct.cjs --all --dry
 */

const https = require('https');
const { XMLParser } = require('fast-xml-parser');
const { PrismaClient } = require('@prisma/client');

const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:sBbOLYIKlSXCXTnLWnYRUTJVAzLUBhhF@caboose.proxy.rlwy.net:31475/railway?sslmode=require';
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const CHIPOWER_BASE = 'https://www.chipower.com.br/resultados/';
const CHIPOWER_EVENTS = 'https://www.chipower.com.br/resultados-eventos';
const DRY = process.argv.includes('--dry');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'REGENI/1.0' } }, res => {
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
  if (l.includes('7k')||l.includes('8k')) return (raw.match(/[\d.]+/)||[''])[0]+'km';
  if (l.includes('5k')) return '5km';
  if (l.includes('3k')) return '3km';
  if (l.includes('1k')) return '1km';
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
  if (age<70) return '60-69';
  return '70+';
}

function parseDate(s) {
  const months = {janeiro:'01',fevereiro:'02','março':'03',marco:'03',abril:'04',maio:'05',junho:'06',julho:'07',agosto:'08',setembro:'09',outubro:'10',novembro:'11',dezembro:'12'};
  const m = s?.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/);
  if (m) return new Date(`${m[3]}-${months[m[2].toLowerCase()]||'01'}-${m[1].padStart(2,'0')}`);
  return new Date();
}

async function listEvents() {
  const html = await fetch(CHIPOWER_EVENTS);
  return [...html.matchAll(/g-live\.html\?f=([^"\\]*(?:\\.[^"\\]*)*)/g)]
    .map(m => m[1].replace(/\\\//g,'/').replace(/\\u00c7/g,'Ç').replace(/\\u00c3/g,'Ã').replace(/\\u00da/g,'Ú').replace(/\\u00e7/g,'ç').replace(/\\u00e3/g,'ã'));
}

async function parseClax(path) {
  const xml = await fetch(CHIPOWER_BASE + path);
  const doc = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:'' }).parse(xml);
  const ep = doc.Epreuve;
  if (!ep) return null;

  const name = (ep.nom||'').trim();
  const dates = ep.dates||'';
  const org = ep.organisateur||'';
  const stM = org.match(/(BA|SE|PE|AL|CE|RN|PB|PI|MA|MG|SP|RJ|PR|RS|SC|GO|MT|MS|ES|DF|TO|RO|AC|AM|PA|AP|RR)\s*$/i);
  const state = stM ? stM[1].toUpperCase() : 'BR';
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

  return { name, dates, city, state, org, dists, grouped, total:merged.length };
}

async function importEvent(path) {
  console.log(`\n📡 ${path}`);
  const data = await parseClax(path);
  if (!data) { console.log('  ❌ Invalid CLAX'); return {ok:0,err:0}; }

  console.log(`  🏁 ${data.name} | ${data.city} ${data.state} | ${data.total} finishers | ${data.dists.join(', ')}`);
  if (DRY) { return {ok:0,err:0}; }

  // Find or create race
  const searchName = data.name.substring(0,20).toUpperCase();
  let race = await prisma.race.findFirst({ where: { name: { contains: data.name.substring(0,15), mode: 'insensitive' } } });
  
  if (!race) {
    race = await prisma.race.create({ data: {
      name: data.name, city: data.city||'NE', state: data.state,
      date: parseDate(data.dates), distances: data.dists.join(','),
      organizer: data.org||'ChipPower', status: 'completed'
    }});
    console.log(`  ✅ Race created: ${race.id}`);
  } else {
    console.log(`  📌 Race exists: ${race.id}`);
  }

  let ok = 0, err = 0;
  for (const [dist, results] of Object.entries(data.grouped)) {
    const distKm = parseFloat(dist)||0;
    for (const r of results) {
      try {
        // Find or create athlete
        let athlete = await prisma.athlete.findFirst({ where: { name: { equals: r.name, mode: 'insensitive' } } });
        if (!athlete) {
          athlete = await prisma.athlete.create({ data: { name: r.name, age: r.age||0, gender: r.gender, state: data.state } });
        }

        // Check existing, then create
        const exists = await prisma.result.findFirst({ where: { athleteId: athlete.id, raceId: race.id, distance: dist } });
        if (exists) { ok++; continue; }
        await prisma.result.create({ data: {
          raceId: race.id, athleteId: athlete.id, distance: dist,
          time: r.time||'00:00:00', pace: calcPace(r.time,distKm),
          overallRank: r.rank||0, genderRank: 0, ageGroup: ageGroup(r.age)
        }});
        ok++;
      } catch(e) { err++; }
    }
    console.log(`  📏 ${dist}: ${results.length} → ${ok} ok`);
  }
  return {ok, err};
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--event')) {
    const path = args[args.indexOf('--event')+1];
    const r = await importEvent(path);
    console.log(`\n✅ Done: ${r.ok} imported, ${r.err} errors`);
  } else if (args.includes('--all')) {
    const events = await listEvents();
    console.log(`🚀 ${events.length} events to import${DRY?' (DRY RUN)':''}\n`);
    let totalOk=0, totalErr=0;
    for (const path of events) {
      try {
        const r = await importEvent(path);
        totalOk += r.ok; totalErr += r.err;
      } catch(e) { console.error(`  ❌ ${e.message}`); }
      await new Promise(r=>setTimeout(r,500));
    }
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🎉 DONE: ${totalOk} imported, ${totalErr} errors`);
  } else {
    console.log('Usage:\n  node import-direct.cjs --event "PATH" [--dry]\n  node import-direct.cjs --all [--dry]');
  }
  await prisma.$disconnect();
}

main().catch(e => { console.error('💥', e.message); prisma.$disconnect(); });
