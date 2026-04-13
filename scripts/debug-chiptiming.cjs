#!/usr/bin/env node
const puppeteer = require('puppeteer');
const DELAY = ms => new Promise(r => setTimeout(r, ms));

const EVENT_URL = 'https://eventos.chiptiming.com.br/resultados/2026/maratonafortaleza2026';

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

  // Capturar TODAS as requests de rede
  const allRequests = [];
  page.on('request', req => {
    const url = req.url();
    if (!url.includes('.css') && !url.includes('.js') && !url.includes('.png') && 
        !url.includes('.ico') && !url.includes('font') && !url.includes('analytics')) {
      allRequests.push({ type: 'REQ', method: req.method(), url: url.slice(0, 120) });
    }
  });

  page.on('response', async resp => {
    const url = resp.url();
    if (!url.includes('.css') && !url.includes('.js') && !url.includes('.png') &&
        !url.includes('.ico') && !url.includes('font') && !url.includes('analytics')) {
      const status = resp.status();
      const ct = resp.headers()['content-type'] || '';
      if (ct.includes('json')) {
        try {
          const json = await resp.json();
          allRequests.push({ type: 'RES-JSON', status, url: url.slice(0, 120), keys: Object.keys(json).slice(0, 8) });
        } catch(_) {
          allRequests.push({ type: 'RES-JSON-ERR', status, url: url.slice(0, 120) });
        }
      } else if (status < 400) {
        allRequests.push({ type: 'RES', status, ct: ct.slice(0, 30), url: url.slice(0, 120) });
      }
    }
  });

  console.log('Carregando página...');
  await page.goto(EVENT_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await DELAY(3000);

  // Extrair __NEXT_DATA__
  const nextData = await page.evaluate(() => {
    const el = document.getElementById('__NEXT_DATA__');
    return el ? JSON.parse(el.textContent) : null;
  });
  
  if (nextData?.props?.pageProps?.results) {
    console.log('\n=== Result Lists from __NEXT_DATA__ ===');
    for (const r of nextData.props.pageProps.results) {
      console.log(`  id=${r.id} modality=${r.modality?.code} type=${r.type?.code} isFile=${r.isFile} showLists=${r.showLists}`);
    }
  }

  // Ver botões e links disponíveis na página
  const buttons = await page.evaluate(() => {
    const btns = [];
    document.querySelectorAll('button, a[href], [role="tab"], [role="button"]').forEach(el => {
      const text = el.textContent?.trim().slice(0, 50);
      const href = el.getAttribute('href') || '';
      const dataId = el.getAttribute('data-id') || el.getAttribute('data-result-id') || '';
      const cls = el.className?.slice(0, 60) || '';
      if (text && text.length > 1) {
        btns.push({ tag: el.tagName, text, href: href.slice(0, 80), dataId, cls: cls.slice(0, 40) });
      }
    });
    return btns.slice(0, 40);
  });

  console.log('\n=== DOM Buttons/Links ===');
  for (const b of buttons) {
    if (b.href || b.dataId || b.text.includes('K') || b.text.includes('M') || b.text.includes('Fem') || b.text.includes('Masc')) {
      console.log(`  [${b.tag}] "${b.text}" href="${b.href}" data="${b.dataId}" cls="${b.cls}"`);
    }
  }

  console.log('\n=== Network Requests (non-static) ===');
  for (const r of allRequests) {
    if (r.type === 'RES-JSON') {
      console.log(`  [${r.status}] ${r.url}`);
      console.log(`    keys: ${r.keys}`);
    } else if (r.type === 'RES-JSON-ERR') {
      console.log(`  [${r.status}] JSON-ERR: ${r.url}`);
    }
  }

  // Tentar clicar no primeiro botão de modalidade (42K, 21K, etc)
  console.log('\n=== Tentando clicar em botão 42K ===');
  try {
    const clicked = await page.evaluate(() => {
      const allEls = Array.from(document.querySelectorAll('*'));
      for (const el of allEls) {
        const text = el.textContent?.trim();
        if ((text === '42K' || text === '42 KM' || text === 'MARATONA') && 
            (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'tab')) {
          el.click();
          return `clicou: ${el.tagName} "${text}"`;
        }
      }
      return null;
    });
    console.log('  ' + (clicked || 'Nenhum botão 42K encontrado'));
    await DELAY(3000);
    
    // Ver novas requests após clique
    const afterClick = allRequests.filter(r => r.type === 'RES-JSON');
    console.log(`  Requests JSON após clique: ${afterClick.length}`);
  } catch(e) {
    console.log('  Erro:', e.message);
  }

  // Tirar screenshot para debug
  await page.screenshot({ path: '/tmp/chiptiming-debug.png', fullPage: false });
  console.log('\nScreenshot salva em /tmp/chiptiming-debug.png');

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
