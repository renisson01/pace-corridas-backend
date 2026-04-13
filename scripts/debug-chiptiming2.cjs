#!/usr/bin/env node
const puppeteer = require('puppeteer');
const DELAY = ms => new Promise(r => setTimeout(r, ms));
const EVENT_URL = 'https://eventos.chiptiming.com.br/resultados/2026/maratonafortaleza2026';

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
  
  await page.goto(EVENT_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await DELAY(2000);
  
  const nextData = await page.evaluate(() => {
    const el = document.getElementById('__NEXT_DATA__');
    return el ? JSON.parse(el.textContent) : null;
  });
  
  const pp = nextData?.props?.pageProps;
  if (pp) {
    console.log('pageProps keys:', Object.keys(pp));
    
    // Mostrar resultados (se tiver entries embutidos)
    if (pp.results) {
      for (const r of pp.results) {
        console.log(`\nLista ${r.id} (${r.modality?.code}/${r.type?.code}):`);
        console.log('  keys:', Object.keys(r));
        if (r.entries) console.log('  entries count:', r.entries.length, '| primeiro:', JSON.stringify(r.entries[0]).slice(0, 200));
        if (r.data) console.log('  data:', JSON.stringify(r.data).slice(0, 200));
        if (r.totalCount !== undefined) console.log('  totalCount:', r.totalCount);
      }
    }
    
    // Mostrar event
    if (pp.event) {
      console.log('\nevent keys:', Object.keys(pp.event));
    }
    
    // Dump completo resumido
    const str = JSON.stringify(pp);
    console.log('\npageProps total chars:', str.length);
    // Primeiro 2000 chars para inspecionar
    console.log('\nPrimeiros 3000 chars de pageProps:');
    console.log(str.slice(0, 3000));
  }
  
  await browser.close();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
