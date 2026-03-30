/**
 * Scraper: 41ª Corrida Cidade de Aracaju - 5KM
 * Extrai resultados via HTTP + AES decrypt, salva no banco via Prisma
 */

const https = require('https');
const CryptoJS = require('crypto-js');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const BASE_URL = 'https://resultados.runking.com.br/Speed/41-corrida-cidade-de-aracaju';
const EVENT_SLUG = '41-corrida-cidade-de-aracaju';
const CIPHER_KEY = `${EVENT_SLUG}CIPHER$#`;
const MODALITY = '5KM';
const PER_PAGE = 20;

function fetchPage(page, gender) {
  const url = `${BASE_URL}?modality=${MODALITY}&page=${page}&gender=${gender}&category=`;
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0',
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function extractAthletes(html) {
  const encrypted = html.match(/U2FsdGVkX1[A-Za-z0-9+\/=]{20,}/g);
  if (!encrypted) return [];

  for (const block of encrypted) {
    try {
      const dec = CryptoJS.AES.decrypt(block, CIPHER_KEY).toString(CryptoJS.enc.Utf8);
      if (!dec || dec.length < 10) continue;
      const parsed = JSON.parse(dec);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id && parsed[0].generalPlacement !== undefined) {
        return parsed;
      }
    } catch (e) {
      // Skip
    }
  }
  return [];
}

async function scrapeAllPages() {
  const allAthletes = [];
  const seenIds = new Set();

  for (const gender of ['M', 'F']) {
    let page = 1;
    let empty = 0;

    while (true) {
      process.stdout.write(`  ${gender} page ${page}...`);
      try {
        const html = await fetchPage(page, gender);
        const athletes = extractAthletes(html);

        if (athletes.length === 0) {
          empty++;
          console.log(' empty');
          if (empty >= 2) break; // 2 empty pages in a row = done
          page++;
          await sleep(1000);
          continue;
        }

        empty = 0;
        let added = 0;
        for (const a of athletes) {
          if (!seenIds.has(a.id)) {
            seenIds.add(a.id);
            allAthletes.push(a);
            added++;
          }
        }
        console.log(` ${athletes.length} athletes (${added} new)`);

        if (athletes.length < PER_PAGE) break;
        page++;
      } catch (err) {
        console.log(` ERROR: ${err.message}`);
        break;
      }

      await sleep(800); // rate limit
    }
  }

  console.log(`\nTotal unique athletes: ${allAthletes.length}`);
  return allAthletes;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function saveToDatabase(athletes) {
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

  // 2. Batch save athletes + results
  let created = 0, updated = 0, errors = 0;
  const BATCH = 50;

  for (let i = 0; i < athletes.length; i += BATCH) {
    const batch = athletes.slice(i, i + BATCH);
    const promises = batch.map(async (a) => {
      try {
        const genderRank = parseInt(String(a.genderPlacement).replace(/[^0-9]/g, '')) || null;
        const overallRank = a.generalPlacement || null;

        // Find existing athlete by name + gender
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
      } catch (err) {
        errors++;
        if (errors <= 5) console.error(`  Error saving ${a.name}:`, err.message);
      }
    });

    await Promise.all(promises);
    process.stdout.write(`\r  Saved ${Math.min(i + BATCH, athletes.length)}/${athletes.length} (created: ${created}, updated: ${updated}, errors: ${errors})`);
  }

  console.log(`\n\nDone! Created: ${created} | Updated: ${updated} | Errors: ${errors}`);
}

async function main() {
  console.log('=== Scraper: 41ª Corrida Cidade de Aracaju - 5KM ===\n');

  try {
    const athletes = await scrapeAllPages();
    if (athletes.length === 0) {
      console.log('No athletes found. Aborting.');
      return;
    }

    // Save JSON backup
    const fs = require('fs');
    fs.writeFileSync('/tmp/41corrida_5km_results.json', JSON.stringify(athletes, null, 2));
    console.log('Backup saved to /tmp/41corrida_5km_results.json\n');

    console.log('Saving to database...');
    await saveToDatabase(athletes);
  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
