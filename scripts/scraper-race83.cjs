#!/usr/bin/env node
/**
 * REGENI Scraper — Race83 (.clax XML)
 * 
 * USO:
 *   cd ~/pace-corridas-backend
 *   DATABASE_URL="postgresql://postgres:esjWowaYBBHymMehTZZiLSPjgkQSfDZW@maglev.proxy.rlwy.net:27005/railway?sslmode=require" node scripts/scraper-race83.cjs
 * 
 * Ou passe a URL como argumento:
 *   DATABASE_URL=... node scripts/scraper-race83.cjs "https://race83.com.br/resultados/evento/2025/5-MIJP2025/5-MIJP2025.clax"
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// URLs conhecidas do Race83
const KNOWN_URLS = [
  'https://race83.com.br/resultados/evento/2025/5-MIJP2025/5-MIJP2025.clax'
];

function parseTime(raw) {
  if (!raw) return 'DNS';
  // "02h14'20,634" → "02:14:20"
  const m = raw.match(/(\d+)h(\d+)'(\d+)/);
  if (m) return `${m[1].padStart(2,'0')}:${m[2].padStart(2,'0')}:${m[3].padStart(2,'0')}`;
  return raw;
}

function normalizeDistance(parcours) {
  if (!parcours) return '5K';
  const s = parcours.toUpperCase();
  if (s.includes('MARATONA') && !s.includes('MEIA')) return '42K';
  if (s.includes('MEIA')) return '21K';
  if (s.includes('10K') || s.includes('10 K')) return '10K';
  if (s.includes('5K') || s.includes('5 K')) return '5K';
  if (s.includes('3K') || s.includes('3 K')) return '3K';
  if (s.includes('15K') || s.includes('15 K')) return '15K';
  return parcours;
}

function calcPace(timeStr, distKm) {
  if (!timeStr || timeStr === 'DNS' || !distKm) return null;
  const p = timeStr.split(':').map(Number);
  let secs = 0;
  if (p.length === 3) secs = p[0]*3600 + p[1]*60 + p[2];
  else if (p.length === 2) secs = p[0]*60 + p[1];
  if (!secs) return null;
  const ps = secs / distKm;
  return Math.floor(ps/60) + ':' + String(Math.round(ps%60)).padStart(2,'0');
}

function ageGroup(age) {
  if (!age) return null;
  if (age < 20) return '16-19';
  if (age < 25) return '20-24';
  if (age < 30) return '25-29';
  if (age < 35) return '30-34';
  if (age < 40) return '35-39';
  if (age < 45) return '40-44';
  if (age < 50) return '45-49';
  if (age < 55) return '50-54';
  if (age < 60) return '55-59';
  if (age < 70) return '60-69';
  return '70+';
}

async function scrapeUrl(url) {
  console.log(`\n📥 Baixando: ${url}`);
  const res = await fetch(url);
  if (!res.ok) { console.error(`❌ HTTP ${res.status}`); return; }
  const xml = await res.text();
  console.log(`   XML: ${(xml.length/1024).toFixed(0)}KB`);

  // Parse event info
  const evtMatch = xml.match(/<Epreuve[^>]*nom="([^"]*)"[^>]*lieu="([^"]*)"[^>]*date="([^"]*)"/);
  const eventName = evtMatch ? evtMatch[1] : 'Evento Race83';
  const eventCity = evtMatch ? evtMatch[2] : '';
  const eventDate = evtMatch ? evtMatch[3] : '';
  console.log(`   Evento: ${eventName} | ${eventCity} | ${eventDate}`);

  // Parse distances (Parcours)
  const distMap = {};
  const parcoursMatches = xml.matchAll(/<Pcs nom="([^"]*)" distance="(\d+)"/g);
  for (const pm of parcoursMatches) {
    const distM = parseInt(pm[2]);
    if (distM >= 3000) {
      distMap[pm[1]] = normalizeDistance(pm[1]);
    }
  }
  console.log(`   Distâncias:`, Object.values(distMap).filter((v,i,a) => a.indexOf(v) === i).join(', '));

  // Parse athletes (Concurrent)
  const athletes = [];
  const concMatches = xml.matchAll(/<Concurrent[^>]+>/g);
  for (const cm of concMatches) {
    const tag = cm[0];
    const get = (attr) => { const m = tag.match(new RegExp(`${attr}="([^"]*)"`)); return m ? m[1] : null; };
    
    const name = get('nom');
    const firstName = get('prenom');
    const fullName = [firstName, name].filter(Boolean).join(' ').trim().toUpperCase();
    if (!fullName || fullName.length < 2) continue;
    
    const gender = get('sx') === '1' ? 'M' : get('sx') === '2' ? 'F' : null;
    const parcours = get('cat1') || get('crs');
    const equipe = get('club');
    const dossard = get('doss');
    const age = get('age') ? parseInt(get('age')) : null;
    
    athletes.push({ fullName, gender, parcours, equipe, dossard, age });
  }
  console.log(`   Atletas: ${athletes.length}`);

  // Parse results
  const resultEntries = [];
  // Results are in <R d="dossard" t="time" m="pace" .../>
  const rMatches = xml.matchAll(/<R d="(\d+)" t="([^"]*)"[^/]*/g);
  const resultsByDossard = {};
  for (const rm of rMatches) {
    const dossard = rm[1];
    const time = rm[2];
    const paceMatch = rm[0].match(/m="([^"]*)"/);
    const pace = paceMatch ? paceMatch[1] : null;
    if (!resultsByDossard[dossard]) resultsByDossard[dossard] = { time, pace };
  }
  console.log(`   Resultados: ${Object.keys(resultsByDossard).length}`);

  // Create race
  let dateObj;
  try {
    const dp = eventDate.split('/');
    dateObj = dp.length === 3 ? new Date(`${dp[2]}-${dp[1]}-${dp[0]}`) : new Date();
  } catch(e) { dateObj = new Date(); }

  const existingRace = await prisma.race.findFirst({
    where: { name: { contains: eventName.slice(0, 20), mode: 'insensitive' } }
  });

  let race;
  if (existingRace) {
    console.log(`   ℹ️ Corrida já existe: ${existingRace.name}`);
    race = existingRace;
  } else {
    const dists = [...new Set(Object.values(distMap))].join(',') || '5K,10K,21K,42K';
    race = await prisma.race.create({
      data: {
        name: eventName,
        city: eventCity || 'João Pessoa',
        state: 'PB',
        date: dateObj,
        distances: dists,
        organizer: 'Race83',
        status: 'completed'
      }
    });
    console.log(`   ✅ Corrida criada: ${race.name}`);
  }

  // Import
  let imported = 0, skipped = 0;
  for (const ath of athletes) {
    const result = resultsByDossard[ath.dossard];
    if (!result) { skipped++; continue; }

    const time = parseTime(result.time);
    if (time === 'DNS' || time === '00:00:00') { skipped++; continue; }

    const distance = distMap[ath.parcours] || normalizeDistance(ath.parcours) || '5K';
    const distKm = parseFloat(distance) || 5;
    const pace = calcPace(time, distKm);

    try {
      let athlete = await prisma.athlete.findFirst({
        where: { name: ath.fullName, gender: ath.gender || undefined }
      });

      if (!athlete) {
        athlete = await prisma.athlete.create({
          data: {
            name: ath.fullName,
            gender: ath.gender,
            equipe: (ath.equipe && !['NAO POSSUO','OUTROS','NAO','SEM','NENHUMA','AVULSO','INDIVIDUAL','SEM EQUIPE','NAO TENHO','PARTICULAR','SEM ASSESSORIA'].includes(ath.equipe.toUpperCase())) ? ath.equipe : null,
            state: 'PB',
            age: ath.age,
            totalRaces: 1,
            totalPoints: 0
          }
        });
      } else {
        await prisma.athlete.update({
          where: { id: athlete.id },
          data: { totalRaces: { increment: 1 } }
        });
      }

      const existing = await prisma.result.findUnique({
        where: { athleteId_raceId: { athleteId: athlete.id, raceId: race.id } }
      });
      if (existing) { skipped++; continue; }

      await prisma.result.create({
        data: {
          athleteId: athlete.id,
          raceId: race.id,
          time: time,
          pace: pace,
          distance: distance,
          ageGroup: ageGroup(ath.age),
          points: 0
        }
      });
      imported++;

      if (imported % 100 === 0) process.stdout.write(`   ✅ ${imported} importados...\r`);
    } catch (e) {
      if (e.code === 'P2002') { skipped++; continue; }
      // silent
    }
  }

  console.log(`\n   ✅ Importados: ${imported} | Ignorados: ${skipped}`);
  return imported;
}

async function main() {
  console.log('🏃 REGENI Scraper — Race83\n');
  
  const urls = process.argv.slice(2).length > 0 ? process.argv.slice(2) : KNOWN_URLS;
  let total = 0;
  
  for (const url of urls) {
    total += await scrapeUrl(url) || 0;
  }

  console.log(`\n🏁 TOTAL IMPORTADO: ${total}`);
  
  const [races, athletes, results] = await Promise.all([
    prisma.race.count(), prisma.athlete.count(), prisma.result.count()
  ]);
  console.log(`📊 Banco: ${races} corridas, ${athletes} atletas, ${results} resultados`);
  
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
