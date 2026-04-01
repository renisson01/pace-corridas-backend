/**
 * Import all RunKing event JSONs to database
 * Reads from data/*_results.json (new format with modalities array)
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const EVENT_FILES = [
  { file: 'maratona-de-aracaju-2025_results.json', raceName: 'Maratona de Aracaju 2025', date: '2025-11-16', city: 'Aracaju', state: 'SE', org: 'Speed Produções e Eventos' },
  { file: '7-corrida-farmacia-ze-do-bairro_results.json', raceName: '7ª Corrida Farmácia Zé do Bairro', date: '2025-09-14', city: 'Aracaju', state: 'SE', org: 'Speed Produções e Eventos' },
  { file: '2-corrida-dos-servidores-publicos-de-sergipe_results.json', raceName: '2ª Corrida dos Servidores Públicos de Sergipe', date: '2025-10-19', city: 'Aracaju', state: 'SE', org: 'Speed Produções e Eventos' },
  { file: 'energisa-electric-run_results.json', raceName: 'Energisa Electric Run', date: '2025-08-17', city: 'Aracaju', state: 'SE', org: 'Speed Produções e Eventos' },
  { file: 'aracaju-tropical-run-2026_results.json', raceName: 'Aracaju Tropical Run 2026', date: '2026-02-09', city: 'Aracaju', state: 'SE', org: 'Speed Produções e Eventos' },
  { file: 'corrida-alusiva-aos-191-anos-da-pm_results.json', raceName: 'Corrida Alusiva aos 191 anos da PM', date: '2026-01-25', city: 'Aracaju', state: 'SE', org: 'Speed Produções e Eventos' },
];

async function importEvent(eventConfig) {
  const filePath = path.join(__dirname, '..', 'data', eventConfig.file);
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠ File not found: ${eventConfig.file}`);
    return { created: 0, updated: 0, results: 0, errors: 0 };
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Flatten athletes from all modalities
  let allAthletes = [];
  if (data.modalities) {
    for (const mod of data.modalities) {
      for (const a of mod.athletes) {
        allAthletes.push({ ...a, _mod: mod.modality === 'default' ? (a.modality || '') : mod.modality });
      }
    }
  } else if (Array.isArray(data)) {
    allAthletes = data.map(a => ({ ...a, _mod: a.modality || '' }));
  }

  console.log(`  ${allAthletes.length} athletes to import`);

  // Find or create Race
  let race = await prisma.race.findFirst({ where: { name: eventConfig.raceName } });
  if (!race) {
    const distances = [...new Set(allAthletes.map(a => a._mod))].filter(Boolean).join(',');
    race = await prisma.race.create({
      data: {
        name: eventConfig.raceName,
        date: new Date(eventConfig.date),
        city: eventConfig.city,
        state: eventConfig.state,
        distances: distances || 'Corrida de Rua',
        organizer: eventConfig.org,
        status: 'completed',
      },
    });
    console.log(`  Race created: ${race.id}`);
  } else {
    console.log(`  Race exists: ${race.id}`);
  }

  // Check existing
  const existingCount = await prisma.result.count({ where: { raceId: race.id } });
  if (existingCount >= allAthletes.length) {
    console.log(`  Already imported (${existingCount} results). Skipping.`);
    return { created: 0, updated: 0, results: existingCount, errors: 0, skipped: true };
  }

  // Build done set
  const existingResults = await prisma.result.findMany({
    where: { raceId: race.id },
    select: { athleteId: true, distance: true },
  });
  const existingAthleteMap = {};
  if (existingResults.length > 0) {
    const athletes = await prisma.athlete.findMany({
      where: { id: { in: existingResults.map(r => r.athleteId) } },
      select: { id: true, name: true, gender: true },
    });
    athletes.forEach(a => { existingAthleteMap[a.id] = a; });
  }
  const doneSet = new Set();
  existingResults.forEach(r => {
    const ath = existingAthleteMap[r.athleteId];
    if (ath) doneSet.add(`${ath.name}|${ath.gender}|${r.distance}`);
  });

  const todo = allAthletes.filter(a => !doneSet.has(`${a.name}|${a.gender}|${a._mod}`));
  console.log(`  Existing: ${existingCount}, To import: ${todo.length}`);

  let created = 0, updated = 0, results = 0, errors = 0;

  for (let i = 0; i < todo.length; i++) {
    const a = todo[i];
    try {
      const genderRank = parseInt(String(a.genderPlacement).replace(/[^0-9]/g, '')) || null;
      const overallRank = a.generalPlacement || null;
      const time = a.liquidTime || a.rawTime || 'DNS';

      let athlete = await prisma.athlete.findFirst({
        where: { name: a.name, gender: a.gender, results: { none: { raceId: race.id } } },
      });
      if (!athlete) {
        athlete = await prisma.athlete.findFirst({
          where: { name: a.name, gender: a.gender, results: { some: { raceId: race.id, distance: a._mod } } },
        });
      }

      if (!athlete) {
        athlete = await prisma.athlete.create({
          data: {
            name: a.name,
            equipe: a.team && a.team !== 'NAO TENHO' ? a.team : null,
            state: a.uf || eventConfig.state,
            gender: a.gender,
            age: a.age || null,
          },
        });
        created++;
      } else {
        await prisma.athlete.update({
          where: { id: athlete.id },
          data: {
            equipe: a.team && a.team !== 'NAO TENHO' ? a.team : athlete.equipe,
            age: a.age || athlete.age,
          },
        });
        updated++;
      }

      await prisma.result.upsert({
        where: { athleteId_raceId: { athleteId: athlete.id, raceId: race.id } },
        update: { time, pace: a.pace || null, overallRank, genderRank, ageGroup: a.category, distance: a._mod },
        create: {
          time, pace: a.pace || null, overallRank, genderRank, ageGroup: a.category, distance: a._mod,
          athlete: { connect: { id: athlete.id } },
          race: { connect: { id: race.id } },
        },
      });
      results++;
    } catch (err) {
      errors++;
      if (errors <= 3) console.error(`  Err: ${a.name} - ${err.message.substring(0, 100)}`);
    }

    if ((i + 1) % 200 === 0 || i === todo.length - 1) {
      process.stdout.write(`\r  ${i + 1}/${todo.length} | +${created} ~${updated} | res=${results} err=${errors}`);
    }
  }

  console.log('');
  return { created, updated, results: results + existingCount, errors };
}

async function main() {
  console.log('=== Import RunKing Events to Database ===\n');

  const totals = { created: 0, updated: 0, results: 0, errors: 0 };

  for (const ev of EVENT_FILES) {
    console.log(`\n📌 ${ev.raceName}`);
    const r = await importEvent(ev);
    totals.created += r.created;
    totals.updated += r.updated;
    totals.results += r.results;
    totals.errors += r.errors;
  }

  // Final counts
  const totalAthletes = await prisma.athlete.count();
  const totalResults = await prisma.result.count();
  const totalRaces = await prisma.race.count();

  console.log(`\n\n========================================`);
  console.log(`✅ IMPORT COMPLETE`);
  console.log(`========================================`);
  console.log(`This batch: +${totals.created} athletes, ${totals.results} results, ${totals.errors} errors`);
  console.log(`\nDATABASE TOTALS:`);
  console.log(`  Races:    ${totalRaces}`);
  console.log(`  Athletes: ${totalAthletes}`);
  console.log(`  Results:  ${totalResults}`);
  console.log(`========================================`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
