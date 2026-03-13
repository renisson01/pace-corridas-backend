import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Pegar as 3 primeiras corridas sem imagem
const corridas = await prisma.corridaAberta.findMany({
  where: { imageUrl: null },
  take: 3
});

console.log(`${corridas.length} corridas sem imagem. Testando...`);

for (const c of corridas) {
  try {
    console.log(`\nBuscando: ${c.linkInscricao}`);
    const { data: html } = await axios.get(c.linkInscricao, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0' },
      timeout: 10000
    });
    const $ = cheerio.load(html);

    // Testar vários seletores de imagem
    const sels = [
      'img[class*="banner"]', 'img[class*="cover"]', 'img[class*="event"]',
      '.evento-img img', '#banner img', 'og\\:image',
      'meta[property="og:image"]'
    ];

    for (const sel of sels) {
      const el = $(sel).first();
      const src = el.attr('content') || el.attr('src') || '';
      if (src && src.startsWith('http')) {
        console.log(`✅ ${sel}: ${src.slice(0,80)}`);
        break;
      }
    }

    // Meta og:image é mais confiável
    const og = $('meta[property="og:image"]').attr('content') || '';
    if (og) console.log(`🖼️  og:image: ${og.slice(0,100)}`);

  } catch(e) { console.log(`❌ ${e.message}`); }
}

await prisma.$disconnect();
