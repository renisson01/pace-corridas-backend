import axios from 'axios';
import * as cheerio from 'cheerio';

const { data: html } = await axios.get('https://beta.ticketsports.com.br/Calendario', {
  headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36' },
  timeout: 25000
});

const $ = cheerio.load(html);

$('a[href^="/e/"]').slice(0,3).each((i, el) => {
  const $el = $(el);
  console.log(`\n=== CARD ${i+1} ===`);
  console.log(`HREF: ${$el.attr('href')}`);
  // Ver estrutura interna
  $el.children().each((j, child) => {
    console.log(`  child[${j}] tag=${child.tagName} text="${$(child).text().trim().slice(0,60)}"`);
  });
  // Ver parágrafos e spans
  $el.find('p,span,div,h2,h3').each((j, child) => {
    const t = $(child).text().trim();
    if (t) console.log(`  ${child.tagName}: "${t.slice(0,80)}"`);
  });
});
