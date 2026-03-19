import { config } from "dotenv";
import "./agents/index.js";
if (!process.env.RAILWAY_ENVIRONMENT_NAME) config({ path: ".env" });

process.on("unhandledRejection", e => { console.error("❌ ERRO FATAL:", e); });
process.on("uncaughtException", e => { console.error("❌ CRASH:", e); });

if (!process.env.DATABASE_URL) { console.error("❌ DATABASE_URL não configurada!"); process.exit(1); }
if (!process.env.JWT_SECRET)      if (!process.env.JWT_SECRET) console.warn("⚠️  JWT_SECRET não configurado");
if (!process.env.ADMIN_KEY)       console.warn('⚠️  ADMIN_KEY não configurado — usando fallback INSEGURO!');
if (!process.env.MP_ACCESS_TOKEN) if (!process.env.MP_ACCESS_TOKEN) console.warn("⚠️  MP_ACCESS_TOKEN não configurado");
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
import { coachRoutes }           from './modules/coach/coach.routes.js';
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
import { integracoesRoutes }    from './modules/integracoes/integracoes.routes.js';
import { leagueRoutes } from './modules/league/league.routes.js';
import { passportRoutes } from './modules/passport/passport.routes.js';
import { subscriptionRoutes } from './modules/subscription/subscription.routes.js';
import { cobaiaRoutes } from './modules/cobaia/cobaia.routes.js';

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
  'index','entrar','perfil','calendario','resultados','social','elite',
  'pacematch','organizador','stats','faixas','calculadoras',
  'assessorias','assessoria','loja','loja-admin','meu-resultado',
  'ia','ia-avatar','admin-pedidos','scraper','importar-resultado',
  'comunidades','gps','corridas-abertas','corridas-realizadas','atleta','amigo-pace','treinador','cobaia','exames'
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


// ═══ GUARD: Treinador só para coaches ═══
import jwt_guard from 'jsonwebtoken';
app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/treinador.html') {
    try {
      const token = req.headers.cookie?.match(/pace_token=([^;]+)/)?.[1]
        || req.headers.authorization?.replace('Bearer ', '');
      if (!token) return; // deixa carregar, JS redireciona
      const JWT = process.env.JWT_SECRET || 'pace-secret-2026';
      const decoded = jwt_guard.verify(token, JWT);
      // Verificar no banco se é coach
      const { PrismaClient: PC } = await import('@prisma/client');
      const p = new PC();
      const user = await p.user.findUnique({ where: { id: decoded.userId }, select: { isCoach: true } });
      await p.$disconnect();
      if (user && !user.isCoach) {
        return reply.code(403).type('text/html').send(
          '<html><body style="background:#04060b;color:#eee;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">' +
          '<div><div style="font-size:48px;margin-bottom:16px">🔒</div>' +
          '<h2 style="color:#ff6b00;margin-bottom:8px">Acesso Exclusivo para Treinadores</h2>' +
          '<p style="color:#8899bb;margin-bottom:24px">Esta area e exclusiva para treinadores cadastrados.</p>' +
          '<a href="/entrar.html?role=coach" style="background:#ff6b00;color:#000;padding:14px 32px;border-radius:14px;font-weight:800;text-decoration:none;font-size:16px">Quero ser Treinador PACE</a>' +
          '<br><br><a href="/atleta.html" style="color:#8899bb;font-size:14px">Voltar para area do atleta</a>' +
          '</div></body></html>'
        );
      }
    } catch {}
  }
});

try {
  await app.register(authRoutes);
  await app.register(raceRoutes);
  await app.register(resultsRoutes);
  await app.register(rankingRoutes);
  await app.register(scraperRoutes);
  await app.register(organizerRoutes);
  await app.register(matchRoutes);
  await app.register(coachRoutes);
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
  await app.register(integracoesRoutes);
  await app.register(leagueRoutes);
  await app.register(passportRoutes);
  await app.register(subscriptionRoutes);
  await app.register(cobaiaRoutes);
  console.log('✅ Todas as rotas registradas (v3.0 PACE BRAZIL)');
} catch(e) {
  console.error('❌ ERRO ao registrar rotas:', e.message);
  console.error(e.stack);
}


// Keep-alive removido — singleton Prisma gerencia conexões

app.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' }, (err) => {
  if (err) { console.error('❌', err); process.exit(1); }
  console.log('🏃 PACE BRAZIL v3.0 online na porta ' + (process.env.PORT || 3000));
});
