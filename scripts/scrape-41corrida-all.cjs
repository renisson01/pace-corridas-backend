/**
 * Scraper: 41ª Corrida Cidade de Aracaju - TODAS AS MODALIDADES
 * Extrai resultados via HTTP + AES decrypt
 */

const https = require('https');
const CryptoJS = require('crypto-js');
const fs = require('fs');

const BASE_URL = 'https://resultados.runking.com.br/Speed/41-corrida-cidade-de-aracaju';
const EVENT_SLUG = '41-corrida-cidade-de-aracaju';
const CIPHER_KEY = `${EVENT_SLUG}CIPHER$#`;
const PER_PAGE = 20;

function fetchPage(modality, page, gender) {
  const url = `${BASE_URL}?modality=${encodeURIComponent(modality)}&page=${page}&gender=${gender}&category=`;
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
    } catch (e) {}
  }
  return [];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function scrapeModality(modality) {
  console.log(`\n=== ${modality} ===`);
  const allAthletes = [];
  const seenIds = new Set();

  for (const gender of ['M', 'F']) {
    let page = 1;
    let empty = 0;

    while (true) {
      process.stdout.write(`  ${gender} p${page}...`);
      try {
        const html = await fetchPage(modality, page, gender);
        const athletes = extractAthletes(html);

        if (athletes.length === 0) {
          empty++;
          process.stdout.write(' empty');
          if (empty >= 2) { console.log(' (done)'); break; }
          page++;
          await sleep(800);
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
      await sleep(800);
    }
  }

  console.log(`  Total ${modality}: ${allAthletes.length} atletas`);
  return allAthletes;
}

async function main() {
  const modalities = process.argv.slice(2);
  if (modalities.length === 0) {
    console.log('Usage: node scrape-41corrida-all.cjs 10KM 24KM');
    process.exit(1);
  }

  for (const mod of modalities) {
    const athletes = await scrapeModality(mod);
    const filename = `data/41corrida_${mod.toLowerCase()}_results.json`;
    fs.writeFileSync(filename, JSON.stringify(athletes, null, 2));
    console.log(`  Saved: ${filename} (${athletes.length} athletes)\n`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
