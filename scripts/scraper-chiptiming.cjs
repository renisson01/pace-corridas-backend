#!/usr/bin/env node
/**
 * REGENI Scraper — ChipTiming (resultado.chiptiming.com.br)
 * 
 * A API de resultados requer token. Este script:
 * 1. Lista eventos disponíveis
 * 2. Para scraping real, precisa acessar via browser (Puppeteer)
 * 
 * USO:
 *   node scripts/scraper-chiptiming.cjs --list          # Lista eventos
 *   node scripts/scraper-chiptiming.cjs --event <slug>  # Scrape um evento (via fetch HTML)
 *
 * NOTA: A API de resultados exige token JWT. 
 * Alternativa: pegar resultados via HTML público do site.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const API = 'https://resultado.chiptiming.com.br/api/v1';

async function listEvents() {
  console.log('📋 Listando eventos ChipTiming...\n');
  const res = await fetch(`${API}/eventos?tempo=passado&empresaId=1`);
  const j = await res.json();
  const events = j.eventos || [];
  console.log(`Total: ${events.length} eventos\n`);
  
  for (const e of events) {
    const dists = e.modalidades?.map(m => m.nome).join(', ') || e.distancias || '';
    console.log(`${e.id} | ${e.slug} | ${e.nomeOficial?.slice(0,50)} | ${e.cidade || ''} | ${dists}`);
  }
  
  // Save to DB as races (without results, just metadata)
  let created = 0;
  for (const e of events) {
    const name = e.nomeOficial || e.slug;
    const existing = await prisma.race.findFirst({
      where: { name: { contains: name.slice(0, 20), mode: 'insensitive' } }
    });
    if (existing) continue;
    
    try {
      await prisma.race.create({
        data: {
          name,
          city: e.cidade || '',
          state: e.uf || '',
          date: e.dataInicio ? new Date(e.dataInicio) : new Date(),
          distances: e.modalidades?.map(m => m.nome).join(',') || '5K,10K',
          organizer: 'ChipTiming',
          status: 'completed'
        }
      });
      created++;
    } catch(err) {}
  }
  
  console.log(`\n✅ ${created} corridas novas criadas no banco`);
}

async function scrapeEvent(slug) {
  console.log(`🏃 Scraping evento: ${slug}`);
  
  // Try to fetch HTML result page
  const url = `https://resultado.chiptiming.com.br/evento/${slug}`;
  console.log(`📥 Fetching: ${url}`);
  
  const res = await fetch(url);
  const html = await res.text();
  
  if (html.includes('404') || html.includes('Não Encontrada')) {
    console.error('❌ Evento não encontrado. Tente com outro slug.');
    console.log('\nDica: use --list para ver slugs disponíveis');
    return;
  }
  
  // ChipTiming é Vue.js SPA - dados carregados via JS
  // Não dá extrair resultados via fetch simples
  console.log('⚠️ ChipTiming é uma SPA (Vue.js). Resultados são carregados via JavaScript.');
  console.log('');
  console.log('Para scrapar resultados, use Puppeteer:');
  console.log('  npm install puppeteer');
  console.log('  node scripts/scraper-chiptiming-puppeteer.cjs --event ' + slug);
  console.log('');
  console.log('Ou acesse manualmente e salve o HTML/CSV.');
}

async function main() {
  const arg = process.argv[2];
  
  if (arg === '--list') {
    await listEvents();
  } else if (arg === '--event' && process.argv[3]) {
    await scrapeEvent(process.argv[3]);
  } else {
    console.log('USO:');
    console.log('  node scripts/scraper-chiptiming.cjs --list');
    console.log('  node scripts/scraper-chiptiming.cjs --event <slug>');
  }
  
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
