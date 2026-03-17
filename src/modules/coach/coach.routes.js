import prisma from '../lib/prisma.js';
import jwt from 'jsonwebtoken';


function getUser(req) {
  try {
    const h = req.headers.authorization;
    if (!h) return null;
    return jwt.verify(h.replace('Bearer ', ''), process.env.JWT_SECRET || 'pace2026');
  } catch { return null; }
}

async function getCoachProfile(userId) {
  return prisma.coachProfile.findUnique({ where: { userId }, include: { atletas: true, subscription: true } });
}

export async function coachRoutes(fastify) {

  // ─────────────────────────────────────────────
  // PERFIL DO TREINADOR
  // ─────────────────────────────────────────────

  // GET /coach/perfil — retorna perfil do coach logado
  fastify.get('/coach/perfil', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      let perfil = await getCoachProfile(u.userId);
      // auto-criar perfil se não existir
      if (!perfil) {
        perfil = await prisma.coachProfile.create({
          data: { userId: u.userId, ativo: true },
          include: { atletas: true, subscription: true }
        });
      }
      const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { name: true, email: true, city: true, state: true } });
      return { perfil, user };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // PATCH /coach/perfil — atualiza perfil
  fastify.patch('/coach/perfil', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { bio, especialidade, instagram, whatsapp, cidade, estado } = req.body || {};
    try {
      let perfil = await prisma.coachProfile.findUnique({ where: { userId: u.userId } });
      if (!perfil) {
        perfil = await prisma.coachProfile.create({ data: { userId: u.userId, bio, especialidade, instagram, whatsapp, cidade, estado } });
      } else {
        perfil = await prisma.coachProfile.update({ where: { userId: u.userId }, data: { bio, especialidade, instagram, whatsapp, cidade, estado } });
      }
      return { success: true, perfil };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ─────────────────────────────────────────────
  // ATLETAS DO TREINADOR
  // ─────────────────────────────────────────────

  // GET /coach/atletas — lista atletas vinculados
  fastify.get('/coach/atletas', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const perfil = await prisma.coachProfile.findUnique({ where: { userId: u.userId } });
      if (!perfil) return { atletas: [] };

      const vinculos = await prisma.coachAtleta.findMany({
        where: { coachId: perfil.id, status: 'ativo' },
        include: {
          atleta: {
            select: {
              id: true, name: true, email: true, city: true, state: true,
              gender: true, age: true, tempo5k: true, tempo10k: true,
              tempo21k: true, tempo42k: true, fcMax: true, fcRepouso: true,
              nivelAtleta: true, isPremium: true, createdAt: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      const atletas = vinculos.map(v => ({
        id: v.atleta.id,
        nome: v.atleta.name,
        email: v.atleta.email,
        cidade: v.atleta.city,
        estado: v.atleta.state,
        genero: v.atleta.gender,
        idade: v.atleta.age,
        tempo5k: v.atleta.tempo5k,
        tempo10k: v.atleta.tempo10k,
        tempo21k: v.atleta.tempo21k,
        tempo42k: v.atleta.tempo42k,
        fcMax: v.atleta.fcMax,
        fcRepouso: v.atleta.fcRepouso,
        nivel: v.atleta.nivelAtleta,
        isPremium: v.atleta.isPremium,
        vinculoId: v.id,
        vinculoSince: v.createdAt,
      }));

      return { atletas, total: atletas.length };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // POST /coach/atletas/convidar — vincula atleta por email
  fastify.post('/coach/atletas/convidar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { email } = req.body || {};
    if (!email) return reply.code(400).send({ error: 'Email obrigatório' });
    try {
      let perfil = await prisma.coachProfile.findUnique({ where: { userId: u.userId } });
      if (!perfil) perfil = await prisma.coachProfile.create({ data: { userId: u.userId } });

      const atleta = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (!atleta) return reply.code(404).send({ error: 'Atleta não encontrado no PACE' });

      const existing = await prisma.coachAtleta.findUnique({ where: { coachId_atletaId: { coachId: perfil.id, atletaId: atleta.id } } });
      if (existing) return reply.code(400).send({ error: 'Atleta já vinculado' });

      const vinculo = await prisma.coachAtleta.create({ data: { coachId: perfil.id, atletaId: atleta.id, status: 'ativo' } });
      return { success: true, vinculo, atleta: { id: atleta.id, nome: atleta.name, email: atleta.email } };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // DELETE /coach/atletas/:atletaId — remover atleta
  fastify.delete('/coach/atletas/:atletaId', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const perfil = await prisma.coachProfile.findUnique({ where: { userId: u.userId } });
      if (!perfil) return reply.code(404).send({ error: 'Perfil não encontrado' });
      await prisma.coachAtleta.updateMany({
        where: { coachId: perfil.id, atletaId: req.params.atletaId },
        data: { status: 'inativo' }
      });
      return { success: true };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // GET /coach/atletas/:atletaId — perfil completo de um atleta
  fastify.get('/coach/atletas/:atletaId', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const atleta = await prisma.user.findUnique({
        where: { id: req.params.atletaId },
        select: {
          id: true, name: true, email: true, city: true, state: true,
          gender: true, age: true, tempo5k: true, tempo10k: true,
          tempo21k: true, tempo42k: true, fcMax: true, fcRepouso: true,
          nivelAtleta: true, isPremium: true, createdAt: true
        }
      });
      if (!atleta) return reply.code(404).send({ error: 'Atleta não encontrado' });

      // Resultados recentes
      const resultados = await prisma.result.findMany({
        where: { userId: atleta.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, raceName: true, distance: true, time: true, pace: true, createdAt: true }
      }).catch(() => []);

      const atividades = await prisma.atividadeGPS.findMany({ where: { userId: atleta.id }, orderBy: { iniciadoEm: 'desc' }, take: 5, select: { id:true, tipo:true, distanciaKm:true, duracaoSeg:true, paceMedio:true, titulo:true, fonte:true, iniciadoEm:true } }).catch(() => []);
      return { atleta, resultados, atividades };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ─────────────────────────────────────────────
  // TREINOS ESTRUTURADOS
  // ─────────────────────────────────────────────

  // POST /coach/treinos — criar treino para um atleta
  fastify.post('/coach/treinos', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { atletaId, titulo, descricao, tipo, distanciaKm, dataEspecifica, horario, local, semana, observacoes, etapas } = req.body || {};
    if (!titulo) return reply.code(400).send({ error: 'Título obrigatório' });
    try {
      const perfil = await prisma.coachProfile.findUnique({ where: { userId: u.userId } });

      // Usar comunidade do coach como referência (ou criar lógica própria)
      // Por ora salvar como treino da comunidade do atleta OU criar modelo próprio
      // Vamos usar o model Treino existente adaptado
      const atletaUser = atletaId ? await prisma.user.findUnique({ where: { id: atletaId }, select: { id: true, name: true } }) : null;

      // Buscar ou criar comunidade padrão do coach
      let comunidade = await prisma.comunidade.findFirst({ where: { adminId: u.userId } }).catch(() => null);
      if (!comunidade) {
        comunidade = await prisma.comunidade.create({
          data: {
            nome: `Equipe do Treinador`,
            slug: `coach-${u.userId}`,
            descricao: 'Equipe gerenciada pelo painel do treinador',
            adminId: u.userId,
            cidade: '',
            estado: '',
            tipo: 'privada',
          }
        }).catch(() => null);
      }
      if (!comunidade) return reply.code(500).send({ error: 'Erro ao criar estrutura do treino' });

      const treino = await prisma.treino.create({
        data: {
          comunidadeId: comunidade.id,
          titulo,
          descricao: descricao || observacoes || '',
          horario: horario || '06:00',
          local: local || '',
          periodo: tipo || 'Contínuo',
          dataEspecifica: dataEspecifica ? new Date(dataEspecifica) : null,
          recorrente: false,
          etapas: etapas?.length ? {
            create: etapas.map((e, i) => ({
              ordem: i + 1,
              tipo: e.tipo || 'base',
              descricao: e.descricao || '',
              durMin: e.durMin ? parseInt(e.durMin) : null,
              distanciaM: e.distM ? parseInt(e.distM) : null,
              zona: e.zona || null,
              zonaFCmin: null,
            }))
          } : undefined
        },
        include: { etapas: true }
      });

      return { success: true, treino };
    } catch(e) { console.error('COACH TREINO ERROR:', e); return reply.code(500).send({ error: e.message }); }
  });

  // GET /coach/treinos — listar treinos criados pelo coach
  fastify.get('/coach/treinos', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const comunidades = await prisma.comunidade.findMany({ where: { adminId: u.userId }, select: { id: true } }).catch(() => []);
      if (!comunidades.length) return { treinos: [] };

      const ids = comunidades.map(c => c.id);
      const treinos = await prisma.treino.findMany({
        where: { comunidadeId: { in: ids } },
        include: { etapas: { orderBy: { ordem: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      return { treinos };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // GET /coach/treinos/:treinoId — detalhe do treino
  fastify.get('/coach/treinos/:treinoId', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const treino = await prisma.treino.findUnique({
        where: { id: req.params.treinoId },
        include: { etapas: { orderBy: { ordem: 'asc' } }, checkins: true, confirmacoes: true }
      });
      if (!treino) return reply.code(404).send({ error: 'Treino não encontrado' });
      return { treino };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // DELETE /coach/treinos/:treinoId
  fastify.delete('/coach/treinos/:treinoId', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      await prisma.treinoEtapa.deleteMany({ where: { treinoId: req.params.treinoId } });
      await prisma.treino.delete({ where: { id: req.params.treinoId } });
      return { success: true };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ─────────────────────────────────────────────
  // PLANILHA SEMANAL
  // ─────────────────────────────────────────────

  // GET /coach/planilha/:atletaId?semana=YYYY-WW
  fastify.get('/coach/planilha/:atletaId', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const { semana } = req.query;
      const atleta = await prisma.user.findUnique({
        where: { id: req.params.atletaId },
        select: { id: true, name: true, tempo5k: true, fcMax: true, fcRepouso: true, nivelAtleta: true }
      });
      if (!atleta) return reply.code(404).send({ error: 'Atleta não encontrado' });

      // Calcular zonas FC
      let zonas = null;
      if (atleta.fcMax) {
        const fc = atleta.fcMax, fr = atleta.fcRepouso || Math.round(fc * 0.35), res = fc - fr;
        const z = (a, b) => ({ min: Math.round(fr + res * a), max: Math.round(fr + res * b) });
        zonas = { Z1: z(.50, .64), Z2: z(.65, .75), Z3: z(.76, .84), Z4: z(.85, 1), Z5: z(1.01, 1.10) };
      }

      // Calcular paces
      let paces = null;
      if (atleta.tempo5k) {
        const [m, s] = atleta.tempo5k.split(':').map(Number);
        const pb = (m * 60 + (s || 0)) / 5;
        const f = v => `${Math.floor(v / 60)}:${Math.round(v % 60).toString().padStart(2, '0')}`;
        paces = { trote: f(pb * 1.45), ccl: f(pb * 1.20), ccm: f(pb * 1.08), ccr: f(pb * .97), z1: f(pb * .89), z2: f(pb * .84) };
      }

      return { atleta, zonas, paces, treinos: [] };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ─────────────────────────────────────────────
  // DASHBOARD STATS
  // ─────────────────────────────────────────────

  // GET /coach/dashboard
  fastify.get('/coach/dashboard', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const perfil = await prisma.coachProfile.findUnique({ where: { userId: u.userId }, include: { atletas: true } });
      const totalAtletas = perfil?.atletas?.filter(a => a.status === 'ativo').length || 0;

      const comunidades = await prisma.comunidade.findMany({ where: { adminId: u.userId }, select: { id: true } }).catch(() => []);
      const ids = comunidades.map(c => c.id);
      const totalTreinos = ids.length ? await prisma.treino.count({ where: { comunidadeId: { in: ids } } }).catch(() => 0) : 0;

      return { totalAtletas, totalTreinos, checkinsHoje: 0 };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ─────────────────────────────────────────────
  // CALCULADORA DE ZONAS FC E PACES
  // ─────────────────────────────────────────────

  // POST /coach/calcular-zonas
  fastify.post('/coach/calcular-zonas', async (req, reply) => {
    const { fcMax, fcRepouso } = req.body || {};
    if (!fcMax) return reply.code(400).send({ error: 'FC Máxima obrigatória' });
    const fr = fcRepouso || Math.round(fcMax * 0.35);
    const res = fcMax - fr;
    const z = (a, b) => ({ min: Math.round(fr + res * a), max: Math.round(fr + res * b), pct: `${Math.round(a*100)}-${Math.round(b*100)}%` });
    return {
      fcMax, fcRepouso: fr,
      zonas: {
        'Z1 Trote / Regenerativo': z(.50, .64),
        'Z2 CCL — Base Aeróbica': z(.65, .75),
        'Z3 CCM — Limiar Aeróbico': z(.76, .84),
        'Z4 CCR — Limiar Anaeróbico': z(.85, 1.00),
        'Z5 VO2max — Sprint': z(1.01, 1.10),
      }
    };
  });

  // POST /coach/calcular-paces
  fastify.post('/coach/calcular-paces', async (req, reply) => {
    const { tempo5k } = req.body || {};
    if (!tempo5k) return reply.code(400).send({ error: 'Tempo 5km obrigatório' });
    const [m, s] = tempo5k.split(':').map(Number);
    const pb = (m * 60 + (s || 0)) / 5;
    const f = v => `${Math.floor(v / 60)}:${Math.round(v % 60).toString().padStart(2, '0')}`;
    return {
      base5km: tempo5k,
      paces: {
        'Trote / Aquecimento': { pace: f(pb * 1.45), zona: 'Z1', intensidade: '50-64%' },
        'CCL — Contínuo Leve': { pace: f(pb * 1.20), zona: 'Z2', intensidade: '65-75%' },
        'CCM — Contínuo Moderado': { pace: f(pb * 1.08), zona: 'Z3', intensidade: '76-84%' },
        'CCR — Contínuo Forte': { pace: f(pb * .97), zona: 'Z4', intensidade: '85-100%' },
        'CCR Z1 — Tiros VO2': { pace: f(pb * .89), zona: 'Z5', intensidade: '101-105%' },
        'CCR Z2 — Sprint': { pace: f(pb * .84), zona: 'Z5+', intensidade: '106-110%' },
      }
    };
  });

  // ─────────────────────────────────────────────
  // LINK DE CADASTRO — vincula atleta ao coach no registro
  // ─────────────────────────────────────────────

  // GET /coach/link/:coachUserId — usado no cadastro pelo atleta
  fastify.get('/coach/link/:coachUserId', async (req, reply) => {
    try {
      const coach = await prisma.user.findUnique({ where: { id: req.params.coachUserId }, select: { name: true, id: true } });
      if (!coach) return reply.code(404).send({ error: 'Treinador não encontrado' });
      const perfil = await prisma.coachProfile.findUnique({ where: { userId: coach.id }, select: { id: true, especialidade: true, instagram: true } });
      return { coach: { nome: coach.name, ...perfil } };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

}
