#!/usr/bin/env node
/**
 * Generic RunKing scraper - scrapes any event from resultados.runking.com.br
 * Usage: node scrape-runking-event.cjs <company> <eventSlug> [modality]
 * Example: node scrape-runking-event.cjs Speed maratona-de-aracaju-2025
 *          node scrape-runking-event.cjs Speed maratona-de-aracaju-2025 42K
 */

const https = require('https');
const CryptoJS = require('crypto-js');
const fs = require('fs');
const path = require('path');

const PER_PAGE = 20;

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'Accept': 'text/html', 'User-Agent': 'Mozilla/5.0 Chrome/120' },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function decryptBlocks(html, key) {
  const enc = html.match(/U2FsdGVkX1[A-Za-z0-9+\/=]{20,}/g) || [];
  const results = [];
  for (const block of enc) {
    try {
      const dec = CryptoJS.AES.decrypt(block, key).toString(CryptoJS.enc.Utf8);
      if (!dec || dec.length < 10) continue;
      const parsed = JSON.parse(dec);
      results.push(parsed);
    } catch (e) {}
  }
  return results;
}

function findAthleteData(blocks) {
  for (const b of blocks) {
    if (Array.isArray(b) && b.length > 0 && b[0].id && b[0].generalPlacement !== undefined) {
      return b;
    }
  }
  return null;
}

function findStats(blocks) {
  for (const b of blocks) {
    if (b && b.modality && Array.isArray(b.modality)) return b;
  }
  return null;
}

async function getEventInfo(company, slug) {
  const html = await fetch(`https://resultados.runking.com.br/${company}/${slug}`);
  const key = `${slug}CIPHER$#`;
  const blocks = decryptBlocks(html, key);
  const stats = findStats(blocks);

  // Extract event metadata from RSC
  const nameMatch = html.match(/"eventName":"([^"]+)"/);
  const dateMatch = html.match(/"eventMainDate":(\d+)/);
  const cityMatch = html.match(/"eventCity":"([^"]+)"/);
  const ufMatch = html.match(/"eventUF":"([^"]+)"/);
  const startMatch = html.match(/"startTime":"([^"]+)"/);

  return {
    name: nameMatch ? nameMatch[1] : slug,
    date: dateMatch ? new Date(parseInt(dateMatch[1])) : (startMatch ? new Date(startMatch[1]) : null),
    city: cityMatch ? cityMatch[1] : 'Desconhecida',
    state: ufMatch ? ufMatch[1] : 'XX',
    modalities: stats ? stats.modality.map(m => ({
      code: m.modality,
      totalAthletes: m.totalAthletes,
      totalFinishers: m.totalFinishers,
    })) : [],
  };
}

async function scrapeModality(company, slug, modality) {
  const key = `${slug}CIPHER$#`;
  const allAthletes = [];
  const seenIds = new Set();

  for (const gender of ['M', 'F']) {
    let page = 1;
    let empty = 0;

    while (true) {
      const url = `https://resultados.runking.com.br/${company}/${slug}?modality=${encodeURIComponent(modality)}&page=${page}&gender=${gender}&category=`;
      process.stdout.write(`  ${gender} p${page}...`);

      try {
        const html = await fetch(url);
        const blocks = decryptBlocks(html, key);
        const athletes = findAthleteData(blocks);

        if (!athletes || athletes.length === 0) {
          empty++;
          process.stdout.write(' empty');
          if (empty >= 2) { console.log(' (done)'); break; }
          page++;
          await sleep(600);
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
        process.stdout.write(` ${added}`);

        if (athletes.length < PER_PAGE) { console.log(' (last)'); break; }
        page++;
      } catch (err) {
        console.log(` ERR: ${err.message}`);
        break;
      }

      await sleep(600);
    }
  }

  return allAthletes;
}

async function main() {
  const company = process.argv[2] || 'Speed';
  const slug = process.argv[3];
  const onlyMod = process.argv[4]; // optional: scrape only one modality

  if (!slug) {
    console.log('Usage: node scrape-runking-event.cjs <company> <eventSlug> [modality]');
    console.log('Example: node scrape-runking-event.cjs Speed maratona-de-aracaju-2025');
    process.exit(1);
  }

  console.log(`=== RunKing Scraper: ${company}/${slug} ===\n`);

  // Get event info
  const info = await getEventInfo(company, slug);
  console.log(`Event: ${info.name}`);
  console.log(`Date: ${info.date ? info.date.toISOString().split('T')[0] : '?'}`);
  console.log(`City: ${info.city}, ${info.state}`);
  console.log(`Modalities: ${info.modalities.length}`);
  info.modalities.forEach(m => console.log(`  ${m.code}: ${m.totalAthletes} athletes, ${m.totalFinishers} finishers`));

  const modalities = onlyMod ? [onlyMod] : info.modalities.map(m => m.code);
  if (modalities.length === 0) {
    // Try default page to detect modality
    console.log('\nNo modalities detected, trying generic scrape...');
    modalities.push('');
  }

  const allResults = {};
  let grandTotal = 0;

  for (const mod of modalities) {
    console.log(`\n--- ${mod || 'DEFAULT'} ---`);
    const athletes = await scrapeModality(company, slug, mod);
    console.log(`  Subtotal: ${athletes.length}`);
    allResults[mod || 'default'] = athletes;
    grandTotal += athletes.length;
  }

  console.log(`\n=== Grand total: ${grandTotal} athletes ===`);

  // Save to file
  const outDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `${slug}_results.json`);
  const output = {
    source: 'runking',
    company,
    slug,
    event: info,
    scrapedAt: new Date().toISOString(),
    totalAthletes: grandTotal,
    modalities: Object.keys(allResults).map(mod => ({
      modality: mod,
      count: allResults[mod].length,
      athletes: allResults[mod],
    })),
  };

  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log(`\nSaved to: ${outFile}`);
}

main().catch(e => { console.error(e); process.exit(1); });
