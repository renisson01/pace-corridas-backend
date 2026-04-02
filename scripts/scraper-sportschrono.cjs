#!/usr/bin/env node
/**
 * REGENI Scraper — SportsChrono (via RaceZone JSON)
 * Extrai resultados de https://resultados.racezone.com.br/sportschrono/
 * 
 * Usage: DATABASE_URL=... node scripts/scraper-sportschrono.cjs
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE = 'https://resultados.racezone.com.br/sportschrono/data';

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function formatTime(raw) {
  if (!raw) return 'DNS';
  // Format: "0:14:43.039" or "1:23:45.678"
  const parts = raw.split(':');
  if (parts.length === 3) {
    const h = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    const s = Math.floor(parseFloat(parts[2]));
    if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `00:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  return raw;
}

function calcPace(timeStr, distKm) {
  if (!timeStr || timeStr === 'DNS' || !distKm) return null;
  const parts = timeStr.split(':').map(Number);
  let secs = 0;
  if (parts.length === 3) secs = parts[0]*3600 + parts[1]*60 + parts[2];
  else if (parts.length === 2) secs = parts[0]*60 + parts[1];
  if (!secs) return null;
  const paceS = secs / distKm;
  const pm = Math.floor(paceS / 60);
  const ps = Math.round(paceS % 60);
  return `${pm}:${String(ps).padStart(2,'0')}`;
}

function normalizeDistance(raw) {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/\s/g, '');
  if (s.includes('3K') || s === '3KM') return '3K';
  if (s.includes('5K') || s === '5KM') return '5K';
  if (s.includes('10K') || s === '10KM') return '10K';
  if (s.includes('15K') || s === '15KM') return '15K';
  if (s.includes('21K') || s.includes('MEIA')) return '21K';
  if (s.includes('42K') || s.includes('MARAT')) return '42K';
  return raw;
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

async function main() {
  console.log('🏃 REGENI Scraper — SportsChrono\n');

  // 1. Get all events
  const events = await fetchJSON(`${BASE}/events.json`);
  const eventList = Object.entries(events);
  console.log(`📋 ${eventList.length} eventos encontrados\n`);

  let totalImported = 0;

  for (const [idx, evt] of eventList) {
    const slug = evt.slug || evt.id || idx;
    const eventName = evt.name || 'Evento ' + idx;
    console.log(`\n--- ${eventName} (${slug}) ---`);

    try {
      // Get event details
      const eventData = await fetchJSON(`${BASE}/${slug}/event.json`);
      const city = eventData.city || eventData.local || '';
      const state = eventData.state || 'SE';
      const dateStr = eventData.date || eventData.startDate || null;
      const date = dateStr ? new Date(dateStr) : new Date();

      // Get categories/distances
      const categories = eventData.categories || eventData.cats || {};

      // Get results
      let results;
      try {
        results = await fetchJSON(`${BASE}/${slug}/results.json`);
      } catch (e) {
        console.log(`  ⚠️ Sem resultados: ${e.message}`);
        continue;
      }

      if (!Array.isArray(results) || results.length === 0) {
        console.log('  ⚠️ Sem resultados');
        continue;
      }

      console.log(`  📊 ${results.length} resultados`);

      // Determine distances from categories
      const catDistances = {};
      if (categories) {
        Object.entries(categories).forEach(([catId, cat]) => {
          const name = cat.name || cat.nm || '';
          catDistances[catId] = normalizeDistance(name);
        });
      }

      // Create race
      const distances = [...new Set(Object.values(catDistances).filter(Boolean))].join(',') || '5K';
      
      // Check if race already exists
      const existingRace = await prisma.race.findFirst({
        where: { name: { contains: eventName.slice(0, 20), mode: 'insensitive' } }
      });

      let race;
      if (existingRace) {
        console.log(`  ℹ️ Corrida já existe: ${existingRace.name}`);
        race = existingRace;
      } else {
        race = await prisma.race.create({
          data: {
            name: eventName,
            city: city || 'Sergipe',
            state: state || 'SE',
            date: date,
            distances: distances,
            organizer: 'SportsChrono',
            status: 'completed'
          }
        });
        console.log(`  ✅ Corrida criada: ${race.name}`);
      }

      // Import results
      let imported = 0;
      let skipped = 0;

      for (const r of results) {
        const name = (r.nm || '').trim().toUpperCase();
        if (!name || name.length < 2) { skipped++; continue; }

        const time = formatTime(r.tn || r.tg);
        if (r.s === 'DSQ' || r.s === 'DNF') { skipped++; continue; }

        const gender = r.g === 'F' ? 'F' : r.g === 'M' ? 'M' : null;
        const distance = catDistances[r.c] || normalizeDistance(r.c) || '5K';
        const distKm = parseFloat(distance) || 5;
        const pace = calcPace(time, distKm);
        const age = r.a ? parseInt(r.a) : null;
        const ageGrp = ageGroup(age);

        try {
          // Find or create athlete
          let athlete = await prisma.athlete.findFirst({
            where: { name: name, gender: gender || undefined }
          });

          if (!athlete) {
            athlete = await prisma.athlete.create({
              data: {
                name: name,
                gender: gender,
                state: state || 'SE',
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

          // Check for duplicate result
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
              ageGroup: ageGrp,
              overallRank: r.p || null,
              genderRank: null,
              points: 0
            }
          });

          imported++;
        } catch (e) {
          if (e.code === 'P2002') { skipped++; continue; } // Duplicate
          console.error(`  ❌ ${name}: ${e.message}`);
        }
      }

      console.log(`  ✅ Importados: ${imported} | Ignorados: ${skipped}`);
      totalImported += imported;

    } catch (e) {
      console.error(`  ❌ Erro: ${e.message}`);
    }
  }

  console.log(`\n🏁 TOTAL IMPORTADO: ${totalImported} resultados`);
  
  // Final stats
  const [races, athletes, results] = await Promise.all([
    prisma.race.count(), prisma.athlete.count(), prisma.result.count()
  ]);
  console.log(`📊 Banco: ${races} corridas, ${athletes} atletas, ${results} resultados`);
  
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
