#!/usr/bin/env node
/**
 * REGENI Scraper — SportsChrono (via RaceZone JSON) — v4 BATCH
 * Usage: DATABASE_URL=... node scripts/scraper-sportschrono.cjs
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE = 'https://resultados.racezone.com.br/sportschrono/data';

const UF_MAP = {
  'SERGIPE': 'SE', 'SÃO PAULO': 'SP', 'SAO PAULO': 'SP', 'RIO DE JANEIRO': 'RJ',
  'MINAS GERAIS': 'MG', 'BAHIA': 'BA', 'CEARÁ': 'CE', 'CEARA': 'CE',
  'PERNAMBUCO': 'PE', 'PARANÁ': 'PR', 'PARANA': 'PR', 'SANTA CATARINA': 'SC',
  'RIO GRANDE DO SUL': 'RS', 'GOIÁS': 'GO', 'GOIAS': 'GO', 'MARANHÃO': 'MA',
  'MARANHAO': 'MA', 'PARÁ': 'PA', 'PARA': 'PA', 'AMAZONAS': 'AM',
  'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS', 'ALAGOAS': 'AL',
  'PIAUÍ': 'PI', 'PIAUI': 'PI', 'RIO GRANDE DO NORTE': 'RN', 'PARAÍBA': 'PB',
  'PARAIBA': 'PB', 'ESPÍRITO SANTO': 'ES', 'ESPIRITO SANTO': 'ES',
  'TOCANTINS': 'TO', 'RONDÔNIA': 'RO', 'RONDONIA': 'RO', 'ACRE': 'AC',
  'RORAIMA': 'RR', 'AMAPÁ': 'AP', 'AMAPA': 'AP', 'DISTRITO FEDERAL': 'DF',
};

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} para ${url}`);
  return res.json();
}

function parsePlace(place) {
  if (!place) return { city: '', state: 'SE' };
  const parts = place.split('-').map(s => s.trim());
  const city = parts[0] || '';
  const stateRaw = (parts[1] || '').toUpperCase();
  const state = UF_MAP[stateRaw] || stateRaw.slice(0, 2) || 'SE';
  return { city, state };
}

function extractDistance(name) {
  if (!name) return null;
  const up = name.toUpperCase();
  if (/42\s*K|MARAT/.test(up)) return '42K';
  if (/21\s*K|MEIA/.test(up)) return '21K';
  if (/15\s*K/.test(up)) return '15K';
  if (/12\s*K/.test(up)) return '12K';
  if (/11\s*K/.test(up)) return '10K';
  if (/10\s*K/.test(up)) return '10K';
  if (/9\s*K/.test(up))  return '10K';
  if (/8\s*K/.test(up))  return '8K';
  if (/7[,.]5\s*K|7\.5/.test(up)) return '8K';
  if (/7\s*K/.test(up))  return '7K';
  if (/6[,.]8\s*K|6\.8/.test(up)) return '7K';
  if (/6\s*K/.test(up))  return '6K';
  if (/5\s*K/.test(up))  return '5K';
  if (/3\s*K/.test(up))  return '3K';
  return null;
}

function formatTime(raw) {
  if (!raw) return null;
  const parts = raw.split(':');
  if (parts.length === 3) {
    const h = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    const s = Math.floor(parseFloat(parts[2]));
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  return raw;
}

function calcPace(timeStr, distKm) {
  if (!timeStr || !distKm) return null;
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

function distKmValue(distStr) {
  if (!distStr) return null;
  const n = parseFloat(distStr);
  return isNaN(n) ? null : n;
}

// ─── BATCH INSERT via SQL raw ────────────────────────────────────────────────

async function batchUpsertAthletes(athletes) {
  // athletes: [{ name, gender, state, age }]
  // Insere em blocos de 500, ignora duplicatas por (name, gender)
  const CHUNK = 500;
  for (let i = 0; i < athletes.length; i += CHUNK) {
    const chunk = athletes.slice(i, i + CHUNK);
    const values = chunk.map((a, idx) => {
      const id = `sc_${Date.now()}_${i + idx}`;
      const name = (a.name || '').replace(/'/g, "''");
      const gender = a.gender ? `'${a.gender}'` : 'NULL';
      const state = (a.state || 'SE').replace(/'/g, "''");
      const age = a.age ? parseInt(a.age) : 'NULL';
      return `('${id}', '${name}', ${gender}, '${state}', ${age}, 1, 0, NOW(), NOW())`;
    }).join(',\n');

    await prisma.$executeRawUnsafe(`
      INSERT INTO "Athlete" (id, name, gender, state, age, "totalRaces", "totalPoints", "createdAt", "updatedAt")
      VALUES ${values}
      ON CONFLICT DO NOTHING
    `);
  }
}

async function batchInsertResults(results) {
  // results: [{ athleteId, raceId, time, pace, distance, ageGroup, overallRank, genderRank }]
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < results.length; i += CHUNK) {
    const chunk = results.slice(i, i + CHUNK);
    const values = chunk.map((r, idx) => {
      const id = `scr_${Date.now()}_${i + idx}`;
      const time = r.time ? `'${r.time}'` : 'NULL';
      const pace = r.pace ? `'${r.pace}'` : 'NULL';
      const dist = r.distance ? `'${r.distance}'` : 'NULL';
      const ag = r.ageGroup ? `'${r.ageGroup.replace(/'/g, "''")}'` : 'NULL';
      const or_ = r.overallRank || 'NULL';
      const gr = r.genderRank || 'NULL';
      return `('${id}', '${r.athleteId}', '${r.raceId}', ${time}, ${pace}, ${dist}, ${ag}, ${or_}, ${gr}, 0, NOW(), NOW())`;
    }).join(',\n');

    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Result" (id, "athleteId", "raceId", time, pace, distance, "ageGroup", "overallRank", "genderRank", points, "createdAt", "updatedAt")
        VALUES ${values}
        ON CONFLICT DO NOTHING
      `);
      inserted += chunk.length;
      process.stdout.write(`\r  ⏳ Inserindo resultados: ${inserted}/${results.length}...`);
    } catch (e) {
      // fallback individual se batch falhar
      for (const r of chunk) {
        try {
          await prisma.$executeRawUnsafe(`
            INSERT INTO "Result" (id, "athleteId", "raceId", time, pace, distance, "ageGroup", "overallRank", "genderRank", points, "createdAt", "updatedAt")
            VALUES ('scr_${Date.now()}_fb', '${r.athleteId}', '${r.raceId}', ${r.time ? `'${r.time}'` : 'NULL'}, ${r.pace ? `'${r.pace}'` : 'NULL'}, '${r.distance}', NULL, ${r.overallRank || 'NULL'}, ${r.genderRank || 'NULL'}, 0, NOW(), NOW())
            ON CONFLICT DO NOTHING
          `);
          inserted++;
        } catch (_) {}
      }
    }
  }
  return inserted;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🏃 REGENI Scraper — SportsChrono v4 BATCH\n');

  const events = await fetchJSON(`${BASE}/events.json`);
  console.log(`📋 ${events.length} eventos encontrados\n`);

  let totalImported = 0;
  let totalSkipped = 0;

  for (const evt of events) {
    const eventId = evt.id;
    const eventName = evt.name || 'Evento ' + eventId;
    const { city, state } = parsePlace(evt.place);
    const dateStr = evt.startDate || null;
    const date = dateStr ? new Date(dateStr) : new Date();

    console.log(`\n--- ${eventName} (${eventId}) ---`);

    try {
      // Detalhes do evento
      const eventData = await fetchJSON(`${BASE}/${eventId}/event.json`);
      const catMap = {};
      if (Array.isArray(eventData.categories)) {
        for (const cat of eventData.categories) {
          catMap[cat.i] = cat.n;
        }
      }

      // Resultados
      let rawResults;
      try {
        rawResults = await fetchJSON(`${BASE}/${eventId}/results.json`);
      } catch (e) {
        console.log(`  ⚠️  Sem resultados: ${e.message}`);
        continue;
      }

      if (!Array.isArray(rawResults) || rawResults.length === 0) {
        console.log('  ⚠️  Sem resultados');
        continue;
      }

      console.log(`  📊 ${rawResults.length} resultados encontrados`);

      const distance = extractDistance(eventName) || '5K';
      const distKm = distKmValue(distance);

      // Criar ou reutilizar corrida
      let race = await prisma.race.findFirst({
        where: {
          name: { contains: eventName.slice(0, 30), mode: 'insensitive' },
          date: date,
        }
      });

      if (race) {
        console.log(`  ℹ️  Corrida já existe: ${race.name}`);
      } else {
        race = await prisma.race.create({
          data: {
            name: eventName,
            city: city || 'Sergipe',
            state: state || 'SE',
            date,
            distances: distance,
            organizer: evt.organizer || 'SportsChrono',
            status: 'completed',
          }
        });
        console.log(`  ✅ Corrida criada: ${race.name}`);
      }

      // ── FASE 1: Preparar dados em memória ──────────────────────────────
      const validRows = [];
      for (const r of rawResults) {
        const name = (r.nm || '').trim().toUpperCase();
        if (!name || name.length < 2) { totalSkipped++; continue; }
        const time = formatTime(r.tn || r.tg);
        if (!time) { totalSkipped++; continue; }
        const gender = r.g === 'F' ? 'F' : r.g === 'M' ? 'M' : null;
        validRows.push({
          name, gender, time,
          pace: calcPace(time, distKm),
          age: r.a ? parseInt(r.a) : null,
          state: r.ct?.uf || state || 'SE',
          ageGroup: catMap[r.c] || null,
          overallRank: r.n ? parseInt(r.n) : null,
          genderRank: r.rg ? parseInt(r.rg) : null,
          distance,
        });
      }

      console.log(`  🔧 ${validRows.length} válidos para importar`);

      // ── FASE 2: Batch upsert atletas ───────────────────────────────────
      process.stdout.write('  ⏳ Inserindo atletas...');
      await batchUpsertAthletes(validRows);
      console.log(' ✅');

      // ── FASE 3: Buscar IDs dos atletas inseridos ───────────────────────
      const names = [...new Set(validRows.map(r => r.name))];
      const CHUNK = 500;
      const athleteMap = {}; // name → id

      for (let i = 0; i < names.length; i += CHUNK) {
        const chunk = names.slice(i, i + CHUNK);
        const found = await prisma.athlete.findMany({
          where: { name: { in: chunk } },
          select: { id: true, name: true },
        });
        for (const a of found) athleteMap[a.name] = a.id;
      }

      // ── FASE 4: Montar resultados com athleteId ────────────────────────
      const resultRows = validRows
        .filter(r => athleteMap[r.name])
        .map(r => ({
          athleteId: athleteMap[r.name],
          raceId: race.id,
          time: r.time,
          pace: r.pace,
          distance: r.distance,
          ageGroup: r.ageGroup,
          overallRank: r.overallRank,
          genderRank: r.genderRank,
        }));

      // ── FASE 5: Batch insert resultados ───────────────────────────────
      const inserted = await batchInsertResults(resultRows);
      console.log(`\r  ✅ Importados: ${inserted} | Ignorados: ${validRows.length - inserted + totalSkipped}`);
      totalImported += inserted;

    } catch (e) {
      console.error(`  ❌ Erro: ${e.message}`);
    }
  }

  console.log(`\n🏁 TOTAL IMPORTADO: ${totalImported} resultados`);

  const [races, athletes, resultsCount] = await Promise.all([
    prisma.race.count(),
    prisma.athlete.count(),
    prisma.result.count(),
  ]);
  console.log(`📊 Banco: ${races} corridas | ${athletes} atletas | ${resultsCount} resultados`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
