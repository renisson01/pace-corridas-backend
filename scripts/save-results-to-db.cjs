/**
 * Salva resultados do JSON de backup para o banco via Prisma
 * Usage: node save-results-to-db.cjs [5KM] [10KM] [24KM]
 * Default: all modalities
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const ALL_MODALITIES = ['5KM', '10KM', '24KM'];

async function main() {
  const modalities = process.argv.length > 2 ? process.argv.slice(2) : ALL_MODALITIES;
  
  let allAthletes = [];
  for (const mod of modalities) {
    const file = path.join(__dirname, '..', 'data', `41corrida_${mod.toLowerCase()}_results.json`);
    if (!fs.existsSync(file)) {
      console.log(`⚠ File not found: ${file}, skipping ${mod}`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    allAthletes.push(...data.map(a => ({ ...a, _modality: mod })));
    console.log(`  ${mod}: ${data.length} athletes`);
  }
  console.log(`\nTotal: ${allAthletes.length} athletes to import\n`);

  // 1. Find or create Race
  let race = await prisma.race.findFirst({
    where: { name: '41ª Corrida Cidade de Aracaju' },
  });

  if (!race) {
    race = await prisma.race.create({
      data: {
        name: '41ª Corrida Cidade de Aracaju',
        date: new Date('2026-03-28T19:00:00.000Z'),
        city: 'Aracaju',
        state: 'SE',
        distances: '5KM,10KM,24KM',
        organizer: 'Speed Produções e Eventos',
        status: 'completed',
        registrationUrl: 'https://resultados.runking.com.br/Speed/41-corrida-cidade-de-aracaju',
      },
    });
    console.log('Race created:', race.id);
  } else {
    console.log('Race found:', race.id);
  }

  // 2. Save athletes + results in batches
  let created = 0, updated = 0, results = 0, errors = 0;
  const BATCH = 20;

  for (let i = 0; i < allAthletes.length; i += BATCH) {
    const batch = allAthletes.slice(i, i + BATCH);

    for (const a of batch) {
      try {
        const genderRank = parseInt(String(a.genderPlacement).replace(/[^0-9]/g, '')) || null;
        const overallRank = a.generalPlacement || null;
        const modality = a._modality || a.modality || '5KM';

        // Find athlete by name + gender that doesn't already have a result
        // in this race (handles namesakes across modalities)
        let athlete = await prisma.athlete.findFirst({
          where: {
            name: a.name,
            gender: a.gender,
            results: { none: { raceId: race.id } },
          },
        });

        // If not found without result, check if same athlete already has
        // a result with the SAME distance (update case)
        if (!athlete) {
          athlete = await prisma.athlete.findFirst({
            where: {
              name: a.name,
              gender: a.gender,
              results: { some: { raceId: race.id, distance: modality } },
            },
          });
        }

        if (!athlete) {
          athlete = await prisma.athlete.create({
            data: {
              name: a.name,
              equipe: a.team && a.team !== 'NAO TENHO' ? a.team : null,
              state: a.uf || 'SE',
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
              state: a.uf || athlete.state,
            },
          });
          updated++;
        }

        // Upsert Result
        await prisma.result.upsert({
          where: {
            athleteId_raceId: { athleteId: athlete.id, raceId: race.id },
          },
          update: {
            time: a.liquidTime || a.rawTime,
            pace: a.pace,
            overallRank,
            genderRank,
            ageGroup: a.category,
            distance: modality,
          },
          create: {
            athleteId: athlete.id,
            raceId: race.id,
            time: a.liquidTime || a.rawTime,
            pace: a.pace,
            overallRank,
            genderRank,
            ageGroup: a.category,
            distance: modality,
          },
        });
        results++;
      } catch (err) {
        errors++;
        if (errors <= 5) console.error(`  Error: ${a.name} - ${err.message}`);
      }
    }

    process.stdout.write(`\r  Progress: ${Math.min(i + BATCH, allAthletes.length)}/${allAthletes.length} | Athletes: +${created} ~${updated} | Results: ${results} | Errors: ${errors}`);
  }

  console.log(`\n\n✅ Done!`);
  console.log(`  Athletes created: ${created}`);
  console.log(`  Athletes updated: ${updated}`);
  console.log(`  Results saved: ${results}`);
  console.log(`  Errors: ${errors}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
