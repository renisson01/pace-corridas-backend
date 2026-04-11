/**
 * Fast import: bulk inserts com createMany + menos queries
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  const files = [
    { file: 'data/41corrida_5km_results.json', mod: '5KM' },
    { file: 'data/41corrida_10km_results.json', mod: '10KM' },
    { file: 'data/41corrida_24km_results.json', mod: '24KM' },
  ];

  let allData = [];
  for (const { file, mod } of files) {
    const fp = path.join(__dirname, '..', file);
    if (!fs.existsSync(fp)) { console.log(`Skip ${mod}`); continue; }
    const arr = JSON.parse(fs.readFileSync(fp, 'utf8'));
    arr.forEach(a => allData.push({ ...a, _mod: mod }));
    console.log(`${mod}: ${arr.length}`);
  }
  console.log(`Total: ${allData.length}\n`);

  // 1. Race
  let race = await prisma.race.findFirst({ where: { name: '41ª Corrida Cidade de Aracaju' } });
  if (!race) {
    race = await prisma.race.create({
      data: {
        name: '41ª Corrida Cidade de Aracaju',
        date: new Date('2026-03-28T19:00:00.000Z'),
        city: 'Aracaju', state: 'SE',
        distances: '5KM,10KM,24KM',
        organizer: 'Speed Produções e Eventos',
        status: 'completed',
      },
    });
    console.log('Race created:', race.id);
  } else {
    console.log('Race exists:', race.id);
  }

  // 2. Check how many results already exist for this race
  const existingCount = await prisma.result.count({ where: { raceId: race.id } });
  console.log(`Existing results: ${existingCount}`);
  if (existingCount >= allData.length) {
    console.log('All results already imported!');
    return;
  }

  // 3. Get existing athlete names that already have results in this race
  const existingResults = await prisma.result.findMany({
    where: { raceId: race.id },
    select: { athleteId: true, distance: true },
  });
  const existingAthleteIds = new Set(existingResults.map(r => r.athleteId));
  
  // Get athlete names for existing IDs to skip them
  const existingAthletes = existingAthleteIds.size > 0
    ? await prisma.athlete.findMany({
        where: { id: { in: [...existingAthleteIds] } },
        select: { id: true, name: true, gender: true },
      })
    : [];
  
  // Build a set of "name|gender|distance" already done
  const doneSet = new Set();
  for (const r of existingResults) {
    const ath = existingAthletes.find(a => a.id === r.athleteId);
    if (ath) doneSet.add(`${ath.name}|${ath.gender}|${r.distance}`);
  }
  console.log(`Already done keys: ${doneSet.size}`);

  // 4. Filter out already imported
  const todo = allData.filter(a => !doneSet.has(`${a.name}|${a.gender}|${a._mod}`));
  console.log(`To import: ${todo.length}\n`);

  // 5. Import one by one (sequential for stability)
  let created = 0, updated = 0, results = 0, errors = 0;

  for (let i = 0; i < todo.length; i++) {
    const a = todo[i];
    try {
      const genderRank = parseInt(String(a.genderPlacement).replace(/[^0-9]/g, '')) || null;
      const overallRank = a.generalPlacement || null;

      // Find athlete without result in this race, or with same distance
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
            state: a.uf || 'SE', gender: a.gender, age: a.age || null,
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

      const time = a.liquidTime || a.rawTime || 'DNS';
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
      if (errors <= 3) console.error(`\nErr ${a.name}: ${err.message}`);
    }

    if ((i + 1) % 100 === 0 || i === todo.length - 1) {
      process.stdout.write(`\r${i + 1}/${todo.length} | +${created} ~${updated} | res=${results} err=${errors}`);
    }
  }

  console.log(`\n\n✅ Import complete!`);
  console.log(`  Created: ${created} | Updated: ${updated} | Results: ${results} | Errors: ${errors}`);
  console.log(`  Total results in DB: ${await prisma.result.count({ where: { raceId: race.id } })}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
