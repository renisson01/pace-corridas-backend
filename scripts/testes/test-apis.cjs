const puppeteer = require('puppeteer');
(async()=>{
  const browser = await puppeteer.launch({headless:'new', args:['--no-sandbox']});
  const page = await browser.newPage();
  const apis = [];
  page.on('request', req => {
    const url = req.url();
    const ok = url.includes('api') || url.includes('json') || url.includes('evento') || url.includes('calendario') || url.includes('corrida');
    if(ok) apis.push(req.method()+' '+url);
  });
  await page.goto('https://webrun.com.br/calendario/', {waitUntil:'networkidle2', timeout:30000});
  await page.select('select', 'Sao Paulo').catch(()=>{});
  await page.click('button.btn-primary').catch(()=>{});
  await new Promise(r=>setTimeout(r,3000));
  console.log('=== WEBRUN APIs:');
  apis.forEach(a=>console.log(a));
  await browser.close();
})();
