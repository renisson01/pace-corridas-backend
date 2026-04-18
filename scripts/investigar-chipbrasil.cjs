/**
 * ChipBrasil — Investigação Fase 4
 * Explorar /eventos e capturar evento real → interceptar chamada CLAX
 */
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120');

  const allApiCalls = [];
  const allResponses = [];

  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    if (!url.match(/\.(css|woff|woff2|ttf|gif|png|jpg|svg|ico)(\?|$)/) &&
        !url.includes('google') && !url.includes('analytics')) {
      allApiCalls.push({
        method: req.method(),
        url: url.substring(0, 300),
        postData: req.postData() || null,
      });
    }
    req.continue();
  });

  page.on('response', async res => {
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    if (ct.includes('json') && !url.includes('analytics')) {
      try {
        const body = await res.text();
        allResponses.push({ url: url.substring(0, 300), status: res.status(), body });
      } catch {}
    }
  });

  // ── FASE A: /eventos ────────────────────────────────────────────────────────
  console.log('=== /eventos ===');
  await page.goto('https://chipbrasil.com.br/eventos', {
    waitUntil: 'networkidle2', timeout: 60000
  });
  await new Promise(r => setTimeout(r, 5000));

  await page.screenshot({ path: '/tmp/cb-eventos.png' });

  const eventosText = await page.evaluate(() => document.body.innerText.substring(0, 4000));
  console.log('Texto /eventos:\n' + eventosText);

  // Todos os links na página
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a')]
      .map(a => ({ href: a.href, text: a.innerText.trim().substring(0, 60) }))
      .filter(a => a.href && a.href !== '#' && !a.href.includes('javascript'))
  );
  console.log('\nLinks em /eventos:');
  links.forEach(l => console.log(` - ${l.href} | ${l.text}`));

  // Elementos com texto parecendo eventos (data, nome de corrida)
  const eventEls = await page.evaluate(() => {
    return [...document.querySelectorAll('*')]
      .filter(el => {
        const t = (el.innerText || '').trim();
        return el.children.length < 5 &&
          (t.match(/\d{2}\/\d{2}\/\d{4}/) || t.match(/corrida|run|maratona|km|meia/i)) &&
          t.length > 5 && t.length < 200;
      })
      .map(el => ({
        tag: el.tagName,
        class: el.className?.substring?.(0, 80) || '',
        text: el.innerText.trim().substring(0, 150),
        clickable: el.classList.contains('clickable-element'),
        href: el.getAttribute('href') || el.dataset.href || null,
      }))
      .slice(0, 40);
  });
  console.log('\nElementos de evento:');
  eventEls.forEach((e, i) => console.log(`  ${i}. [${e.tag}]${e.clickable ? ' CLICK' : ''} "${e.text}" ${e.href ? '→ ' + e.href : ''}`));

  // ── Tentar clicar no primeiro evento ────────────────────────────────────────
  console.log('\n=== Tentando clicar no primeiro evento ===');
  allApiCalls.length = 0; // reset
  allResponses.length = 0;

  const firstEvent = eventEls.find(e => e.clickable || e.href);
  if (firstEvent) {
    console.log('Clicando em:', firstEvent.text);
    if (firstEvent.href) {
      await page.goto(firstEvent.href, { waitUntil: 'networkidle2', timeout: 30000 });
    } else {
      const el = await page.$(`[class*="${firstEvent.class.split(' ')[2] || ''}"]`);
      if (el) await el.click();
    }
    await new Promise(r => setTimeout(r, 5000));
    await page.screenshot({ path: '/tmp/cb-evento-aberto.png' });
    const afterText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    console.log('Após click:\n' + afterText);
  }

  // ── FASE B: /dashboard ───────────────────────────────────────────────────────
  console.log('\n=== /dashboard ===');
  allApiCalls.length = 0;
  allResponses.length = 0;

  await page.goto('https://chipbrasil.com.br/dashboard', {
    waitUntil: 'networkidle2', timeout: 30000
  });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: '/tmp/cb-dashboard.png' });

  const dashText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
  console.log('Dashboard texto:\n' + dashText);

  const dashLinks = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')]
      .map(a => ({ href: a.href, text: a.innerText.trim() }))
      .filter(a => !a.href.includes('cdnjs') && !a.href.includes('google'))
      .slice(0, 20)
  );
  console.log('\nLinks dashboard:');
  dashLinks.forEach(l => console.log(` - ${l.href} | ${l.text}`));

  // JSON responses capturadas
  console.log('\n=== JSON responses capturadas ===');
  allResponses.forEach((r, i) => {
    console.log(`${i+1}. [${r.status}] ${r.url}`);
    console.log(`   ${r.body.substring(0, 500)}`);
  });

  // ── FASE C: Buscar por CLAX URL no static.js COMPLETO ──────────────────────
  console.log('\n=== FASE C: static.js — extrair brlive.info URLs e params ===');
  await page.goto('https://chipbrasil.com.br/package/static_js/5b8bfdfa20a5ed66f6ffef16981d5df1083bc602c9d76aedd51a2e5b5fa22351/chipbrasil/live/resultados/xnull/xfalse/xfalse/xtrue/static.js', {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  const staticJs = await page.evaluate(() => document.body.innerText);

  // brlive URLs
  const brUrls = [...staticJs.matchAll(/brlive\.info[^"'`\s\\]{0,200}/g)].map(m => m[0]);
  console.log('brlive URLs:', [...new Set(brUrls)]);

  // params_file patterns
  const paramsFiles = [...staticJs.matchAll(/params_file[^{]{0,200}/g)].map(m => m[0]);
  console.log('\nparams_file refs:', paramsFiles.slice(0, 10));

  // Strings parecendo URLs de CLAX
  const claxUrls = [...staticJs.matchAll(/https?:\/\/[^\s"'`]{5,100}\.clax/g)].map(m => m[0]);
  console.log('\nCLAX URLs no JS:', [...new Set(claxUrls)].slice(0, 20));

  // ── FASE D: POST manual para doapicallfromserver com params_file fixo ───────
  console.log('\n=== FASE D: POST manual com arquivo CLAX hipotético ===');

  // O params_file provavelmente contém a URL do CLAX. Tentar injetar manualmente.
  const testFiles = [
    'bsb/resultado.clax',
    'bsb/corrida.clax',
    'bsb/resultados.clax',
  ];

  for (const file of testFiles.slice(0, 2)) {
    const payload = {
      timezone_string: 'America/Sao_Paulo',
      service_name: 'apiconnector2',
      call_name: 'bTIZI.bTIZJ',
      prev: null,
      properties: {
        provider: 'apiconnector2.bTIZI.bTIZJ',
        params_file: file,
        url_params_file: ''
      },
      authentication: null,
    };

    const result = await page.evaluate(async (payload) => {
      try {
        const r = await fetch('https://chipbrasil.com.br/apiservice/doapicallfromserver', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include'
        });
        const body = await r.text();
        return { status: r.status, body: body.substring(0, 500) };
      } catch(e) {
        return { error: e.message };
      }
    }, payload);

    console.log(`\n  params_file="${file}": ${JSON.stringify(result)}`);
  }

  await browser.close();
  console.log('\nScreenshots: /tmp/cb-eventos.png, /tmp/cb-dashboard.png, /tmp/cb-evento-aberto.png');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
