import axios from 'axios';
import * as cheerio from 'cheerio';

const { data: html } = await axios.get('https://beta.ticketsports.com.br/Calendario', {
  headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36' },
  timeout: 25000
});

const $ = cheerio.load(html);
const ESTADOS = ['SP','RJ','MG','RS','PR','SC','CE','BA','PE','GO','DF','SE','AL','MA','PA','AM','MT','MS','RN','PB','PI','ES','RO','TO','AC','AP','RR'];
let corridas = [];

$('a[href^="/e/"]').each((i, el) => {
  const $el = $(el);
  const filhos = $el.children('div');
  const nome    = filhos.eq(2).text().trim().replace('...','');
  const data    = filhos.eq(4).text().trim();
  const local   = filhos.eq(5).text().trim();
  const link    = `https://beta.ticketsports.com.br${$el.attr('href').split('?')[0]}`;

  if (!nome || nome.length < 4) return;

  const partes  = local.split(',').map(p => p.trim());
  const cidade  = partes[0] || '';
  const estado  = (partes[1] || '').slice(0,2).toUpperCase();

  if (!ESTADOS.includes(estado)) return;

  corridas.push({ nome, data, cidade, estado, link });
  console.log(`✅ ${nome} | ${data} | ${cidade}/${estado}`);
});

console.log(`\n🏁 Total: ${corridas.length} corridas`);
