/**
 * Salva resultados do JSON de backup para o banco via Prisma
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();
const MODALITY = '5KM';

async function main() {
  const athletes = JSON.parse(fs.readFileSync('/tmp/41corrida_5km_results.json', 'utf8'));
  console.log(`Loaded ${athletes.length} athletes from backup\n`);

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

  for (let i = 0; i < athletes.length; i += BATCH) {
    const batch = athletes.slice(i, i + BATCH);

    for (const a of batch) {
      try {
        const genderRank = parseInt(String(a.genderPlacement).replace(/[^0-9]/g, '')) || null;
        const overallRank = a.generalPlacement || null;

        // Upsert athlete by name + gender
        let athlete = await prisma.athlete.findFirst({
          where: { name: a.name, gender: a.gender },
        });

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
            distance: MODALITY,
          },
          create: {
            athleteId: athlete.id,
            raceId: race.id,
            time: a.liquidTime || a.rawTime,
            pace: a.pace,
            overallRank,
            genderRank,
            ageGroup: a.category,
            distance: MODALITY,
          },
        });
        results++;
      } catch (err) {
        errors++;
        if (errors <= 5) console.error(`  Error: ${a.name} - ${err.message}`);
      }
    }

    process.stdout.write(`\r  Progress: ${Math.min(i + BATCH, athletes.length)}/${athletes.length} | Athletes: +${created} ~${updated} | Results: ${results} | Errors: ${errors}`);
  }

  console.log(`\n\n✅ Done!`);
  console.log(`  Athletes created: ${created}`);
  console.log(`  Athletes updated: ${updated}`);
  console.log(`  Results saved: ${results}`);
  console.log(`  Errors: ${errors}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
