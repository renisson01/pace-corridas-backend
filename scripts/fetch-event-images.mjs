import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const fetch = (...a) => import('node-fetch').then(({default:f})=>f(...a));
const cheerio = await import('cheerio');

async function getImage(url) {
  try {
    const r = await fetch(url, {
      headers: {'User-Agent':'Mozilla/5.0 (compatible; PACE/1.0)'},
      timeout: 8000
    });
    if (!r.ok) return null;
    const html = await r.text();
    const $ = cheerio.load(html);

    // Tentar og:image primeiro (mais confiável)
    const og = $('meta[property="og:image"]').attr('content');
    if (og && og.startsWith('http')) return og;

    // Twitter card
    const tw = $('meta[name="twitter:image"]').attr('content');
    if (tw && tw.startsWith('http')) return tw;

    // Primeira imagem grande da página
    let best = null;
    $('img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (!src) return;
      const fullSrc = src.startsWith('http') ? src : new URL(src, url).href;
      // Pular ícones e logos pequenos
      if (src.includes('logo') || src.includes('icon') || src.includes('avatar')) return;
      if (!best) best = fullSrc;
    });
    return best;
  } catch { return null; }
}

async function run() {
  const corridas = await prisma.race.findMany({
    where: {
      registrationUrl: { not: null },
      imageUrl: null
    },
    take: 50
  });

  console.log(`🖼️ Buscando imagens para ${corridas.length} corridas...\n`);
  let encontradas = 0;

  for (const c of corridas) {
    const img = await getImage(c.registrationUrl);
    if (img) {
      await prisma.race.update({ where: { id: c.id }, data: { imageUrl: img } });
      console.log(`✅ ${c.name.substring(0,40)} → ${img.substring(0,60)}`);
      encontradas++;
    } else {
      console.log(`❌ ${c.name.substring(0,40)} - sem imagem`);
    }
    await new Promise(r => setTimeout(r, 500)); // delay educado
  }

  console.log(`\n🖼️ Imagens encontradas: ${encontradas}/${corridas.length}`);
  await prisma.$disconnect();
}

run().catch(console.error);
