import Fastify from 'fastify';
import cors from '@fastify/cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

// Rotas
import { raceRoutes } from './modules/races/race.routes.js';
import { athleteRoutes } from './modules/athletes/athlete.routes.js';
import { resultRoutes } from './modules/results/result.routes.js';
import { rankingRoutes } from './modules/ranking/ranking.routes.js';
import { scraperRoutes } from './modules/scraper/scraper.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { organizerRoutes } from './modules/organizer/organizer.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
const app = Fastify({ logger: false });

await app.register(cors, { origin: '*' });

// PÁGINAS HTML
const pages = ['index','stats','scraper','social','resultados','faixas','ranking',
  'entrar','perfil','pacematch','calendario','importar-resultado','organizador'];
for(const pg of pages) {
  const route = pg === 'index' ? '/' : `/${pg}.html`;
  const file = pg === 'index' ? 'index.html' : `${pg}.html`;
  app.get(route, async (req, reply) => {
    try {
      const h = fs.readFileSync(path.join(__dirname,'../public',file),'utf-8');
      reply.type('text/html').send(h);
    } catch { reply.code(404).send('Página não encontrada'); }
  });
}

// Manifest e SW
app.get('/manifest.json', async (req, reply) => {
  try { reply.type('application/json').send(fs.readFileSync(path.join(__dirname,'../public/manifest.json'),'utf-8')); } catch { reply.code(404).send('{}'); }
});
app.get('/sw.js', async (req, reply) => {
  try { reply.type('application/javascript').send(fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf-8')); } catch { reply.code(404).send(''); }
});

// API ROUTES
await app.register(raceRoutes);
await app.register(athleteRoutes);
await app.register(resultRoutes);
await app.register(rankingRoutes);
await app.register(scraperRoutes);
await app.register(authRoutes);
await app.register(organizerRoutes);

// STATUS
app.get('/scraper/status', async () => {
  const [races, results, athletes] = await Promise.all([
    prisma.race.count(),
    prisma.result.count(),
    prisma.athlete.count()
  ]);
  return { totalRaces: races, totalResults: results, athletes, status: 'online' };
});

// SCRAPER CRON 24/7 - a cada 4 horas
setTimeout(async () => {
  try {
    const { runScraperJob } = await import('./jobs/scraperJob.js');
    console.log('[CRON] Scraper iniciado');
    runScraperJob();
    setInterval(() => runScraperJob(), 4*60*60*1000);
  } catch(e) { console.error('[CRON] Erro:', e.message); }
}, 60000);

const PORT = process.env.PORT || 3000;
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if(err) { console.error(err); process.exit(1); }
  console.log(`✅ PACE rodando na porta ${PORT}`);
});
