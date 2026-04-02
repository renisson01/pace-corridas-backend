#!/usr/bin/env node
/**
 * REGENI Scraper — Race83 (.clax XML)
 * 
 * USO:
 *   cd ~/pace-corridas-backend
 *   DATABASE_URL="postgresql://postgres:esjWowaYBBHymMehTZZiLSPjgkQSfDZW@maglev.proxy.rlwy.net:27005/railway?sslmode=require" node scripts/scraper-race83.cjs
 * 
 * Ou passe URLs como argumento:
 *   DATABASE_URL=... node scripts/scraper-race83.cjs "https://race83.com.br/resultados/evento/2025/5-MIJP2025/5-MIJP2025.clax"
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const KNOWN_URLS = [
  'https://race83.com.br/resultados/evento/2025/5-MIJP2025/5-MIJP2025.clax'
];

function parseTime(raw) {
  if (!raw) return 'DNS';
  // "00h14'56,043" → "00:14:56"
  const m = raw.match(/(\d+)h(\d+)'(\d+)/);
  if (m) return `${m[1].padStart(2,'0')}:${m[2].padStart(2,'0')}:${m[3].padStart(2,'0')}`;
  return raw;
}

function normDist(parcours) {
  if (!parcours) return '5K';
  const s = parcours.toUpperCase();
  if (s.includes('MARATONA') && !s.includes('MEIA')) return '42K';
  if (s.includes('MEIA')) return '21K';
  if (s.includes('10K')) return '10K';
  if (s.includes('5K')) return '5K';
  if (s.includes('3K')) return '3K';
  if (s.includes('15K')) return '15K';
  return '5K';
}

function distKm(d) { return parseFloat(d) || 5; }

function calcPace(t, km) {
  if (!t || t === 'DNS' || !km) return null;
  const p = t.split(':').map(Number);
  const s = p.length===3 ? p[0]*3600+p[1]*60+p[2] : p.length===2 ? p[0]*60+p[1] : 0;
  if (!s) return null;
  const ps = s/km;
  return Math.floor(ps/60)+':'+String(Math.round(ps%60)).padStart(2,'0');
}

function ageGroup(birthYear) {
  if (!birthYear) return null;
  const age = new Date().getFullYear() - birthYear;
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

const SKIP_EQUIPES = new Set(['NAO POSSUO','OUTROS','NAO','SEM','NENHUMA','AVULSO','INDIVIDUAL','SEM EQUIPE','NAO TENHO','PARTICULAR','SEM ASSESSORIA','NAO TEM','NAO TENHO ASSESSORIA','NAO TENHO ACESSORIA','SEM ACESSORIA','NENHUM','NAO HA','NAO HA.']);

function cleanEquipe(e) {
  if (!e) return null;
  const u = e.trim().toUpperCase();
  if (SKIP_EQUIPES.has(u) || u.length < 2) return null;
  return e.trim();
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

async function scrapeUrl(url) {
  console.log(`\n📥 Baixando: ${url}`);
  const res = await fetch(url);
  if (!res.ok) { console.error(`❌ HTTP ${res.status}`); return 0; }
  const xml = await res.text();
  console.log(`   XML: ${(xml.length/1024).toFixed(0)}KB`);

  // Event info
  const evtName = attr(xml.match(/<Epreuve[^>]*/)?.[0] || '', 'nom') || 'Evento Race83';
  console.log(`   Evento: ${evtName}`);

  // Parse athletes from <E> tags inside <Engages>
  const engStart = xml.indexOf('<Engages>');
  const engEnd = xml.indexOf('</Engages>');
  if (engStart < 0) { console.error('   ❌ Sem seção <Engages>'); return 0; }
  const engSection = xml.slice(engStart, engEnd + 11);

  const athleteTags = engSection.match(/<E [^>]+\/>/g) || [];
  console.log(`   Atletas: ${athleteTags.length}`);

  const athleteMap = {};
  for (const tag of athleteTags) {
    const doss = attr(tag, 'd');
    if (!doss) continue;
    athleteMap[doss] = {
      name: (attr(tag, 'n') || '').toUpperCase().trim(),
      equipe: cleanEquipe(attr(tag, 'c')),
      birthYear: attr(tag, 'a') ? parseInt(attr(tag, 'a')) : null,
      gender: attr(tag, 'x') === 'F' ? 'F' : attr(tag, 'x') === 'M' ? 'M' : null,
      parcours: attr(tag, 'p'),
      city: attr(tag, 'ip2') || null,
      state: attr(tag, 'ip3') || 'PB'
    };
  }

  // Parse results from <R> tags
  const resultTags = xml.match(/<R d="\d+"[^/]*\/>/g) || [];
  console.log(`   Resultados: ${resultTags.length}`);

  const resultMap = {};
  for (const tag of resultTags) {
    const doss = attr(tag, 'd');
    const time = attr(tag, 't');
    if (doss && time) resultMap[doss] = { time: parseTime(time) };
  }

  // Merge: athletes with results
  const merged = [];
  for (const [doss, ath] of Object.entries(athleteMap)) {
    if (!ath.name || ath.name.length < 2) continue;
    const result = resultMap[doss];
    if (!result || result.time === 'DNS' || result.time === '00:00:00') continue;
    merged.push({ ...ath, time: result.time, distance: normDist(ath.parcours) });
  }
  console.log(`   Atletas com resultado: ${merged.length}`);

  // Distances found
  const dists = [...new Set(merged.map(m => m.distance))];
  console.log(`   Distâncias: ${dists.join(', ')}`);

  // Create race
  const existingRace = await prisma.race.findFirst({
    where: { name: { contains: evtName.slice(0, 25), mode: 'insensitive' } }
  });

  let race;
  if (existingRace) {
    console.log(`   ℹ️ Corrida já existe: ${existingRace.name}`);
    race = existingRace;
  } else {
    race = await prisma.race.create({
      data: {
        name: evtName,
        city: 'João Pessoa',
        state: 'PB',
        date: new Date('2025-08-03'),
        distances: dists.join(','),
        organizer: 'Race83',
        status: 'completed'
      }
    });
    console.log(`   ✅ Corrida criada: ${race.name}`);
  }

  // Import
  let imported = 0, skipped = 0, errors = 0;
  for (const m of merged) {
    const km = distKm(m.distance);
    const pace = calcPace(m.time, km);
    const age = m.birthYear ? new Date().getFullYear() - m.birthYear : null;

    try {
      let athlete = await prisma.athlete.findFirst({
        where: { name: m.name, gender: m.gender || undefined }
      });

      if (!athlete) {
        athlete = await prisma.athlete.create({
          data: {
            name: m.name,
            gender: m.gender,
            equipe: m.equipe,
            state: m.state || 'PB',
            age: age,
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
          time: m.time,
          pace: pace,
          distance: m.distance,
          ageGroup: ageGroup(m.birthYear),
          points: 0
        }
      });
      imported++;

      if (imported % 200 === 0) console.log(`   ✅ ${imported} importados...`);
    } catch (e) {
      if (e.code === 'P2002') { skipped++; continue; }
      errors++;
      if (errors < 5) console.error(`   ❌ ${m.name}: ${e.message?.slice(0,80)}`);
    }
  }

  console.log(`   ✅ FINAL: ${imported} importados | ${skipped} ignorados | ${errors} erros`);
  return imported;
}

async function main() {
  console.log('🏃 REGENI Scraper — Race83\n');
  const urls = process.argv.slice(2).length > 0 ? process.argv.slice(2) : KNOWN_URLS;
  let total = 0;
  for (const url of urls) {
    total += await scrapeUrl(url);
  }
  console.log(`\n🏁 TOTAL IMPORTADO: ${total}`);
  const [races, athletes, results] = await Promise.all([
    prisma.race.count(), prisma.athlete.count(), prisma.result.count()
  ]);
  console.log(`📊 Banco: ${races} corridas, ${athletes} atletas, ${results} resultados`);
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
