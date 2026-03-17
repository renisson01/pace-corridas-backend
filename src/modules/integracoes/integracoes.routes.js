import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
if (!globalThis.__prisma) { globalThis.__prisma = new PrismaClient(); }
const prisma = globalThis.__prisma;
const JWT = process.env.JWT_SECRET || 'pace-secret-2026';
const getUser = (req) => { try { return jwt.verify(req.headers.authorization?.replace('Bearer ',''), JWT); } catch { return null; } };

export async function integracoesRoutes(fastify) {

  // Status das integrações do usuário
  fastify.get('/integracoes/status', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const [ativs, tokens] = await Promise.all([
      prisma.atividadeGPS.groupBy({
        by: ['fonte'], where: { userId: u.userId }, _count: true
      }).catch(() => []),
      prisma.integracaoToken.findMany({
        where: { userId: u.userId, ativo: true },
        select: { provider: true, athleteName: true, updatedAt: true }
      }).catch(() => [])
    ]);
    const fontes = {};
    ativs.forEach(a => { fontes[a.fonte || 'manual'] = a._count; });
    const conectados = {};
    tokens.forEach(t => { conectados[t.provider] = { conectado: true, nome: t.athleteName, ultimaSync: t.updatedAt }; });
    return {
      strava:  conectados.strava || { conectado: false },
      garmin:  conectados.garmin || { conectado: false },
      polar:   conectados.polar || { conectado: false },
      amazfit: { conectado: false }, huawei: { conectado: false }, apple: { conectado: false },
      atividades: fontes,
      mensagem: tokens.length > 0
        ? `${tokens.length} app(s) conectado(s). Sincronize para importar treinos!`
        : 'Conecte seus apps para sincronizar treinos automaticamente'
    };
  });

  // Strava — iniciar OAuth
  fastify.post('/integracoes/strava/connect', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const clientId = process.env.STRAVA_CLIENT_ID;
    if (!clientId) return {
      status: 'coming_soon',
      mensagem: 'Strava em breve! Configure STRAVA_CLIENT_ID no Railway.',
      dica: 'Por enquanto registre seus treinos manualmente na aba Enviar Resultado.'
    };
    const redirect = `https://web-production-990e7.up.railway.app/integracoes/strava/callback`;
    const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=read,activity:read_all&state=${u.userId}`;
    return { url, status: 'redirect_needed' };
  });

  // Strava — callback OAuth
  fastify.get('/integracoes/strava/callback', async (req, reply) => {
    const { code, state: userId, error } = req.query;
    if (error || !code) return reply.redirect('/atleta.html?erro=strava_cancelado');
    try {
      const res = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          code, grant_type: 'authorization_code'
        })
      });
      const data = await res.json();
      if (!data.access_token) return reply.redirect('/atleta.html?erro=strava_auth');
      // Salvar token no campo phone temporariamente (sem alterar schema)
      // Salvar token na tabela própria (não sobrescreve bio)
      await prisma.integracaoToken.upsert({
        where: { userId_provider: { userId, provider: 'strava' } },
        create: {
          userId,
          provider: 'strava',
          accessToken: data.access_token,
          refreshToken: data.refresh_token || null,
          expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null,
          athleteId: String(data.athlete?.id || ''),
          athleteName: data.athlete?.firstname || '',
          scope: 'read,activity:read_all',
        },
        update: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token || null,
          expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null,
          athleteId: String(data.athlete?.id || ''),
          athleteName: data.athlete?.firstname || '',
        }
      }).catch((e) => console.error('[STRAVA TOKEN SAVE]', e.message));
      return reply.redirect('/atleta.html?integrado=strava&nome=' + encodeURIComponent(data.athlete?.firstname || ''));
    } catch(e) { return reply.redirect('/atleta.html?erro=strava_erro'); }
  });

  
// === AUTO REFRESH STRAVA TOKEN ===
async function refreshStravaToken(integracao) {
  if (!integracao.refreshToken) return null;
  try {
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        refresh_token: integracao.refreshToken,
        grant_type: 'refresh_token'
      })
    });
    const data = await res.json();
    if (!data.access_token) return null;
    await prisma.integracaoToken.update({
      where: { id: integracao.id },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || integracao.refreshToken,
        expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null
      }
    });
    console.log('[STRAVA] Token renovado');
    return data.access_token;
  } catch(e) { console.error('[STRAVA REFRESH]', e.message); return null; }
}

  // Strava — sincronizar atividades
  fastify.post('/integracoes/strava/sync', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const integracao = await prisma.integracaoToken.findUnique({
      where: { userId_provider: { userId: u.userId, provider: 'strava' } }
    }).catch(() => null);
    if (!integracao?.accessToken) return reply.code(400).send({ error: 'Strava não conectado. Conecte primeiro.' });
    let token = integracao.accessToken;
    // Auto refresh se expirado
    if (integracao.expiresAt && new Date(integracao.expiresAt) < new Date()) {
      token = await refreshStravaToken(integracao);
      if (!token) return reply.code(400).send({ error: 'Token expirado. Reconecte o Strava.' });
    }
    try {
      const res = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=30', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const atividades = await res.json();
      if (!Array.isArray(atividades)) return reply.code(400).send({ error: 'Token Strava expirado. Reconecte.' });
      const corridas = atividades.filter(a => a.type === 'Run');
      let ok = 0;
      for (const a of corridas) {
        const distKm = parseFloat((a.distance / 1000).toFixed(2));
        const dur = a.moving_time;
        const paceSeconds = distKm > 0 ? dur / distKm : 0;
        const paceStr = `${Math.floor(paceSeconds/60)}:${String(Math.floor(paceSeconds%60)).padStart(2,'0')}`;
        await prisma.atividadeGPS.upsert({
          where: { stravaId: String(a.id) },
          create: {
            userId: u.userId, stravaId: String(a.id), fonte: 'strava',
            tipo: 'corrida', distanciaKm: distKm, duracaoSeg: dur,
            paceMedio: paceStr, velMedia: parseFloat((distKm / (dur/3600)).toFixed(2)),
            elevacaoGanho: a.total_elevation_gain || 0,
            titulo: a.name || 'Corrida Strava',
            compartilhado: false,
            iniciadoEm: new Date(a.start_date),
            finalizadoEm: new Date(new Date(a.start_date).getTime() + dur * 1000),
          },
          update: { titulo: a.name }
        }).then(() => ok++).catch(() => {});
      }
      return { success: true, sincronizadas: ok, total: corridas.length, msg: `${ok} corridas sincronizadas do Strava!` };
    } catch(e) { return reply.code(500).send({ error: 'Erro Strava: ' + e.message }); }
  });

  // Garmin — instrução (OAuth 1.0a complexo, via Strava por enquanto)
  fastify.post('/integracoes/garmin/connect', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    return {
      status: 'coming_soon', mensagem: 'Garmin Connect em breve!',
      dica: 'Conecte seu Garmin ao Strava — os treinos chegam automaticamente ao PACE.',
      link: 'https://support.strava.com/hc/pt-br/articles/216917327'
    };
  });

  // Polar
  fastify.post('/integracoes/polar/connect', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    return { status: 'coming_soon', mensagem: 'Polar Flow em breve!', dica: 'Conecte seu Polar ao Strava para já sincronizar.' };
  });

  // Amazfit / Huawei / Apple
  fastify.post('/integracoes/:app/connect', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const apps = { amazfit: 'Amazfit/Zepp', huawei: 'Huawei Health', apple: 'Apple Health' };
    return { status: 'coming_soon', mensagem: `${apps[req.params.app] || req.params.app} em breve!` };
  });

  // Atividades do atleta para o TREINADOR ver
  fastify.get('/integracoes/atleta/:atletaId/atividades', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const limit = parseInt(req.query.limit) || 10;
    const atividades = await prisma.atividadeGPS.findMany({
      where: { userId: req.params.atletaId },
      orderBy: { iniciadoEm: 'desc' },
      take: limit,
      select: {
        id: true, tipo: true, distanciaKm: true, duracaoSeg: true,
        paceMedio: true, velMedia: true, caloriasEst: true,
        titulo: true, fonte: true, iniciadoEm: true, elevacaoGanho: true
      }
    }).catch(() => []);
    return { atividades, total: atividades.length };
  });

}
