import axios from 'axios';
import * as cheerio from 'cheerio';

const { data: html } = await axios.get('https://beta.ticketsports.com.br/Calendario', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9',
  },
  timeout: 25000
});

const $ = cheerio.load(html);
const links = $('a[href^="/e/"]');
console.log(`Total links /e/: ${links.length}`);
console.log(`HTML total: ${html.length} chars`);
console.log('--- Primeiros 3 links ---');
links.slice(0,3).each((i, el) => {
  const $el = $(el);
  console.log(`LINK: ${$el.attr('href')}`);
  console.log(`TEXT: ${$el.text().replace(/\s+/g,' ').trim().slice(0,100)}`);
  console.log('---');
});

// Testar outros seletores
console.log(`\nLinks /e/ totais: ${$('a[href*="/e/"]').length}`);
console.log(`Cards .card: ${$('.card').length}`);
console.log(`Articles: ${$('article').length}`);
console.log(`\nPrimeiros 500 chars do body:`);
console.log($('body').text().replace(/\s+/g,' ').trim().slice(0,500));
