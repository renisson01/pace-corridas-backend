
process.on("unhandledRejection", e => { console.error("❌ ERRO FATAL:", e); });
process.on("uncaughtException", e => { console.error("❌ CRASH:", e); });

if (!process.env.DATABASE_URL) { console.error("❌ DATABASE_URL não configurada!"); process.exit(1); }
if (!process.env.JWT_SECRET)      console.warn('⚠️  JWT_SECRET não configurado — usando fallback INSEGURO!');
if (!process.env.ADMIN_KEY)       console.warn('⚠️  ADMIN_KEY não configurado — usando fallback INSEGURO!');
if (!process.env.MP_ACCESS_TOKEN) console.warn('⚠️  MP_ACCESS_TOKEN não configurado — pagamentos desativados.');
if (!process.env.ANTHROPIC_API_KEY) console.warn('⚠️  ANTHROPIC_API_KEY não configurado — IA desativada.');

import Fastify from 'fastify';
import cors from '@fastify/cors';
// import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { raceRoutes }            from './modules/races/races.routes.js';
import { resultsRoutes }         from './modules/results/results.routes.js';
import { rankingRoutes }         from './modules/ranking/ranking.routes.js';
import { scraperRoutes }         from './modules/scraper/scraper.routes.js';
import { authRoutes }            from './modules/auth/auth.routes.js';
import { organizerRoutes }       from './modules/organizer/organizer.routes.js';
import { matchRoutes }           from './modules/match/match.routes.js';
import { analyticsRoutes }       from './modules/analytics/analytics.routes.js';
import { uploadRoutes }          from './modules/upload/upload.routes.js';
import { socialRoutes }          from './modules/social/social.routes.js';
import { assessoriaRoutes }      from './modules/assessoria/assessoria.routes.js';
import { lojaRoutes }            from './modules/loja/loja.routes.js';
import { verifyRoutes }          from './modules/results/verify.routes.js';
import { pagamentosRoutes }      from './modules/pagamentos/pagamentos.routes.js';
import { adminRoutes }           from './modules/admin/admin.routes.js';
import { iaRoutes }              from './modules/ia/ia.routes.js';
import { comunidadeRoutes }      from './modules/comunidade/comunidade.routes.js';
import { gpsRoutes }             from './modules/gps/gps.routes.js';
import { corridasAbertasRoutes } from './modules/corridas-abertas/corridas.routes.js';
import { amigoPaceRoutes }       from './modules/amigo-pace/amigo-pace.routes.js';
import { predictionRoutes } from './modules/prediction/prediction.routes.js';
import { leagueRoutes } from './modules/league/league.routes.js';
import { passportRoutes } from './modules/passport/passport.routes.js';
import { subscriptionRoutes } from './modules/subscription/subscription.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: false });

// helmet desativado temporariamente

await app.register(cors, { origin: true });

await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
await app.register(rateLimit, {
  max: 100, timeWindow: '1 minute',
  errorResponseBuilder: () => ({ error: 'Muitas requisições. Aguarde um momento.' })
});

const htmlCache = {};
const pages = [
  'index','entrar','perfil','calendario','resultados','social','elite','x1',
  'pacematch','organizador','stats','faixas','calculadoras','usuario',
  'assessorias','assessoria','loja','loja-admin','meu-resultado',
  'ia','ia-avatar','admin-pedidos','scraper','importar-resultado',
  'comunidades','gps','corridas-abertas','corridas-realizadas','atleta','amigo-pace','treinador'
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
  await app.register(comunidadeRoutes);
  await app.register(gpsRoutes);
  await app.register(corridasAbertasRoutes);
  await app.register(amigoPaceRoutes);
  await app.register(predictionRoutes);
  await app.register(leagueRoutes);
  await app.register(passportRoutes);
  await app.register(subscriptionRoutes);
  console.log('✅ Todas as rotas registradas (v3.0 PACE BRAZIL)');
} catch(e) {
  console.error('❌ ERRO ao registrar rotas:', e.message);
  console.error(e.stack);
}


// Keep-alive: evita que o banco durma no Railway
setInterval(async () => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const p = new PrismaClient();
    await p.$queryRaw`SELECT 1`;
    await p.$disconnect();
  } catch(e) {}
}, 4 * 60 * 1000); // a cada 4 minutos

app.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' }, (err) => {
  if (err) { console.error('❌', err); process.exit(1); }
  console.log('🏃 PACE BRAZIL v3.0 online na porta ' + (process.env.PORT || 3000));
});
