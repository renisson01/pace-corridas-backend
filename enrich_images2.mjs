import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PLACEHOLDER = 'https://cdn.ticketsports.com.br/ticketagora/site/evento-ticket-agora-2x.png';

const corridas = await prisma.corridaAberta.findMany({
  where: { OR: [{ imageUrl: null }, { imageUrl: PLACEHOLDER }] }
});

console.log(`🔍 ${corridas.length} corridas para enriquecer...`);
let ok = 0;

for (const c of corridas) {
  try {
    const { data: html } = await axios.get(c.linkInscricao, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36' },
      timeout: 12000
    });
    const $ = cheerio.load(html);
    const img = $('meta[property="og:image"]').attr('content') ||
                $('meta[name="twitter:image"]').attr('content') || '';

    if (img && img !== PLACEHOLDER && img.startsWith('http')) {
      await prisma.corridaAberta.update({ where: { id: c.id }, data: { imageUrl: img } });
      console.log(`✅ ${c.nome.slice(0,30)} → ${img.slice(0,60)}`);
      ok++;
    } else {
      console.log(`⚠️  ${c.nome.slice(0,30)} → sem imagem`);
    }
    await new Promise(r => setTimeout(r, 1500));
  } catch(e) { console.log(`❌ ${c.nome.slice(0,25)}: ${e.message.slice(0,40)}`); }
}

console.log(`\n🏁 ${ok}/${corridas.length} imagens atualizadas!`);
await prisma.$disconnect();
