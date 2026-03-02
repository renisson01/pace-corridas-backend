process.on("unhandledRejection", e => { console.error("❌ ERRO FATAL:", e); }); process.on("uncaughtException", e => { console.error("❌ CRASH:", e); });
import Fastify from 'fastify';
import cors from '@fastify/cors';

import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
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
import { pagamentosRoutes } from './modules/pagamentos/pagamentos.routes.js';
import { adminRoutes }      from './modules/admin/admin.routes.js';
import { iaRoutes }         from './modules/ia/ia.routes.js';
// import { comunidadeRoutes } from './modules/comunidade/comunidade.routes.js';
// import { gpsRoutes }        from './modules/gps/gps.routes.js';
// import { corridasAbertasRoutes } from './modules/corridas-abertas/corridas.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: false });

// CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['https://web-production-990e7.up.railway.app'];

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  }
});

await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
await app.register(rateLimit, {
  max: 100, timeWindow: '1 minute',
  errorResponseBuilder: () => ({ error: 'Muitas requisições. Aguarde um momento.' })
});

// Cache HTML
const htmlCache = {};
const pages = [
  'index','entrar','perfil','calendario','resultados','social','elite','x1',
  'pacematch','organizador','stats','faixas','calculadoras','usuario',
  'assessorias','assessoria','loja','loja-admin','meu-resultado',
  'ia','ia-avatar','admin-pedidos','scraper','importar-resultado',
  'comunidades','gps','corridas-abertas'
];

for (const pg of pages) {
  const file = pg === 'index' ? 'index.html' : `${pg}.html`;
  try { htmlCache[pg] = fs.readFileSync(path.join(__dirname, '../public', file), 'utf-8'); }
  catch { htmlCache[pg] = null; }
}
for (const pg of pages) {
  const route = pg === 'index' ? '/' : `/${pg}.html`;
  app.get(route, async (req, reply) => {
    if (htmlCache[pg]) return reply.type('text/html').send(htmlCache[pg]);
    return reply.code(404).send('Not found');
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

// ROTAS API
try {
  await app.register(authRoutes);
  await app.register(raceRoutes);
  await app.register(resultsRoutes);
  await app.register(rankingRoutes);
  await app.register(scraperRoutes);
  await app.register(organizerRoutes);
  await app.register(matchRoutes);
  await app.register(analyticsRoutes);
  await app.register(uploadRoutes);
  await app.register(socialRoutes, { prefix: '/social' });
  await app.register(assessoriaRoutes);
  await app.register(lojaRoutes);
  await app.register(verifyRoutes);
  await app.register(iaRoutes);
  await app.register(adminRoutes);
  await app.register(pagamentosRoutes);
  // await app.register(comunidadeRoutes);
  // await app.register(gpsRoutes);
  // await app.register(corridasAbertasRoutes);
  console.log('✅ Todas as rotas registradas (v2.0 PACE BRAZIL)');
} catch(e) {
  console.error('❌ ERRO ao registrar rotas:', e.message);
  console.error(e.stack);
}

app.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' }, (err) => {
  if (err) { console.error('❌', err); process.exit(1); }
  console.log('🏃 PACE BRAZIL online na porta ' + (process.env.PORT || 3000));
});
