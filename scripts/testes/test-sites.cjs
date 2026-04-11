const puppeteer = require('puppeteer');

async function testarSite(nome, url) {
  console.log('\n========== ' + nome + ' ==========');
  const browser = await puppeteer.launch({headless:'new', args:['--no-sandbox']});
  const page = await browser.newPage();
  const apis = [];

  page.on('request', req => {
    const u = req.url();
    const isApi = u.includes('api') || u.includes('.json') || u.includes('evento') ||
                  u.includes('corrida') || u.includes('calendar') || u.includes('race') ||
                  u.includes('graphql') || u.includes('query');
    if(isApi && !u.includes('google') && !u.includes('facebook') && !u.includes('nr-data')) {
      apis.push(req.method() + ' ' + u);
    }
  });

  page.on('response', async res => {
    const u = res.url();
    const ct = res.headers()['content-type'] || '';
    if(ct.includes('json') && !u.includes('google') && !u.includes('nr-data')) {
      try {
        const txt = await res.text();
        console.log('>> JSON response: ' + u);
        console.log('   ' + txt.substring(0, 300));
      } catch(e) {}
    }
  });

  try {
    await page.goto(url, {waitUntil:'networkidle2', timeout:25000});

    // Pega texto visivel
    const texto = await page.evaluate(() => {
      document.querySelectorAll('script,style').forEach(e=>e.remove());
      const els = [...document.querySelectorAll('*')].filter(e =>
        e.children.length === 0 && e.innerText && e.innerText.trim().length > 3
      ).slice(0, 40);
      return els.map(e => e.tagName + ': ' + e.innerText.trim().substring(0,80)).join('\n');
    });

    console.log('-- Texto visivel:');
    console.log(texto);
    console.log('-- APIs capturadas:');
    apis.forEach(a => console.log('  ' + a));

  } catch(e) {
    console.log('ERRO: ' + e.message);
  }

  await browser.close();
}

(async()=>{
  await testarSite('TIQUET', 'https://www.tiquet.com.br/corridas');
  await testarSite('CHIPOWER', 'https://www.chipower.com.br/eventos');
  await testarSite('SPORTSCHRONO', 'https://www.sportschrono.com.br/eventos');
  await testarSite('CENTRAL DA CORRIDA', 'https://centraldacorrida.com.br/');
})();
