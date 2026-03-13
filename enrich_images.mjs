import axios from 'axios';
import * as cheerio from 'cheerio';

// Testar 3 eventos para ver se og:image funciona
const urls = [
  'https://beta.ticketsports.com.br/e/circuito-verao-3--33020',
  'https://beta.ticketsports.com.br/e/1-desafio-maiandeua-33022',
  'https://beta.ticketsports.com.br/e/running-woman-33008',
];

for (const url of urls) {
  try {
    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36' },
      timeout: 12000
    });
    const $ = cheerio.load(html);
    const og = $('meta[property="og:image"]').attr('content') || 
               $('meta[name="twitter:image"]').attr('content') ||
               $('img[class*="banner"], img[class*="cover"], img[class*="event"]').first().attr('src') || '';
    console.log(`URL: ${url.split('/e/')[1]}`);
    console.log(`IMG: ${og.slice(0,100) || 'NÃO ENCONTRADA'}`);
    console.log('---');
  } catch(e) { console.log(`ERRO: ${e.message}`); }
}
