import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { raceRoutes }       from './modules/races/races.routes.js';
import { resultsRoutes }    from './modules/results/results.routes.js';
import { rankingRoutes }    from './modules/ranking/ranking.routes.js';
import { scraperRoutes }    from './modules/scraper/scraper.routes.js';
import { authRoutes }       from './modules/auth/auth.routes.js';
import { organizerRoutes }  from './modules/organizer/organizer.routes.js';
import { matchRoutes }      from './modules/match/match.routes.js';
import { analyticsRoutes }  from './modules/analytics/analytics.routes.js';
import { uploadRoutes }     from './modules/upload/upload.routes.js';
import { socialRoutes }     from './modules/social/social.routes.js';
import { assessoriaRoutes } from './modules/assessoria/assessoria.routes.js';
import { lojaRoutes }       from './modules/loja/loja.routes.js';
import { verifyRoutes }     from './modules/results/verify.routes.js';
import { adminRoutes }      from './modules/admin/admin.routes.js';
import { iaRoutes }         from './modules/ia/ia.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: false });

await app.register(cors, { origin: '*' });
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

// Páginas HTML
const pages = [
  'index','entrar','perfil','calendario','resultados','social','elite','x1',
  'pacematch','organizador','stats','faixas','calculadoras','usuario',
  'assessorias','assessoria','loja','loja-admin','meu-resultado',
  'ia','ia-avatar','admin-pedidos','scraper','importar-resultado'
];
for (const pg of pages) {
  const route = pg === 'index' ? '/' : `/${pg}.html`;
  const file  = pg === 'index' ? 'index.html' : `${pg}.html`;
  app.get(route, async (req, reply) => {
    try { reply.type('text/html').send(fs.readFileSync(path.join(__dirname,'../public',file),'utf-8')); }
    catch { reply.code(404).send('Not found'); }
  });
}
app.get('/manifest.json', async (req, reply) => {
  try { reply.type('application/json').send(fs.readFileSync(path.join(__dirname,'../public/manifest.json'),'utf-8')); }
  catch { reply.send('{}'); }
});
app.get('/sw.js', async (req, reply) => {
  try { reply.type('application/javascript').send(fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf-8')); }
  catch { reply.send(''); }
});

// Rotas API - cada uma registrada UMA vez
await app.register(authRoutes);
await app.register(raceRoutes);
await app.register(resultsRoutes);
await app.register(rankingRoutes);
await app.register(scraperRoutes);
await app.register(organizerRoutes);
await app.register(matchRoutes);
await app.register(analyticsRoutes);
await app.register(uploadRoutes);
await app.register(socialRoutes);
await app.register(assessoriaRoutes);
await app.register(lojaRoutes);
await app.register(verifyRoutes);
await app.register(iaRoutes);
await app.register(adminRoutes);

// Job de scraping (após 1 min)
setTimeout(async () => {
  try {
    const { runScraperJob } = await import('./jobs/scraperJob.js');
    runScraperJob();
    setInterval(() => runScraperJob(), 4 * 60 * 60 * 1000);
  } catch(e) { console.error('[CRON]', e.message); }
}, 60000);

app.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  console.log('✅ PACE online');
});
