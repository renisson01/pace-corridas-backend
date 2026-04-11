const puppeteer = require('puppeteer');

(async()=>{
  const browser = await puppeteer.launch({headless:'new', args:['--no-sandbox']});
  const page = await browser.newPage();
  const apis = [];

  page.on('response', async res => {
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    const isGoogle = url.includes('google') || url.includes('gstatic');
    const isFb = url.includes('facebook') || url.includes('analytics');
    const isNR = url.includes('nr-data') || url.includes('newrelic');

    if (!isGoogle && !isFb && !isNR) {
      apis.push(res.status() + ' ' + url);
    }

    if (ct.includes('json') && !isGoogle && !isFb && !isNR) {
      try {
        const txt = await res.text();
        console.log('\n🔑 JSON ENCONTRADO: ' + url);
        console.log(txt.substring(0, 500));
      } catch(e) {}
    }
  });

  console.log('Abrindo race83.com.br...');
  await page.goto('https://race83.com.br', {waitUntil:'networkidle2', timeout:30000});

  console.log('\n=== TODAS AS REQUESTS:');
  apis.forEach(a => console.log(a));

  // Tenta navegar para resultados
  console.log('\n\nAbrindo página de resultados...');
  apis.length = 0;

  await page.goto('https://race83.com.br/resultados', {waitUntil:'networkidle2', timeout:30000});

  console.log('\n=== REQUESTS em /resultados:');
  apis.forEach(a => console.log(a));

  // Texto visível
  const texto = await page.evaluate(() => {
    document.querySelectorAll('script,style').forEach(e => e.remove());
    const els = [...document.querySelectorAll('*')].filter(e =>
      e.children.length === 0 && e.innerText && e.innerText.trim().length > 3
    ).slice(0, 50);
    return els.map(e => e.tagName + ': ' + e.innerText.trim().substring(0,100)).join('\n');
  });

  console.log('\n=== TEXTO VISÍVEL:');
  console.log(texto);

  await browser.close();
})();
