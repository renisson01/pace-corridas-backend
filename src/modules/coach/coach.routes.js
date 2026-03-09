import { prisma } from '../../utils/prisma.js';
import jwt from 'jsonwebtoken';
const SECRET = process.env.JWT_SECRET || 'pace-secret-2026';

function auth(req) {
  const t = req.headers.authorization?.replace('Bearer ', '');
  if (!t) return null;
  try { return jwt.verify(t, SECRET); } catch { return null; }
}

// Recalcula mensalidade do coach automaticamente
async function recalcularMensalidade(coachProfileId) {
  const count = await prisma.coachAtleta.count({
    where: { coachId: coachProfileId, status: 'ativo' }
  });
  await prisma.coachSubscription.upsert({
    where: { coachId: coachProfileId },
    create: { coachId: coachProfileId, athleteCount: count, monthlyValue: count * 3.99, status: 'trial' },
    update: { athleteCount: count, monthlyValue: Math.round(count * 3.99 * 100) / 100 }
  });
  return count;
}

export async function coachRoutes(fastify) {

  // ============================================================
  // COACH — PERFIL E ONBOARDING
  // ============================================================

  // Virar treinador (cria CoachProfile)
  fastify.post('/coach/ativar', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const jaExiste = await prisma.coachProfile.findUnique({ where: { userId: u.userId } });
    if (jaExiste) return reply.code(409).send({ error: 'Você já é treinador', coachId: jaExiste.id });

    const { bio, especialidade, instagram, whatsapp, cidade, estado } = req.body || {};

    const coach = await prisma.coachProfile.create({
      data: { userId: u.userId, bio, especialidade, instagram, whatsapp, cidade, estado }
    });

    // Criar subscription trial
    await prisma.coachSubscription.create({
      data: { coachId: coach.id, status: 'trial', athleteCount: 0, monthlyValue: 0 }
    });

    // Marcar isCoach no User
    await prisma.user.update({ where: { id: u.userId }, data: { isCoach: true } });

    return { success: true, coach };
  });

  // Ver/atualizar perfil do coach
  fastify.get('/coach/perfil', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const coach = await prisma.coachProfile.findUnique({
      where: { userId: u.userId },
      include: {
        subscription: true,
        _count: { select: { atletas: { where: { status: 'ativo' } } } }
      }
    });
    if (!coach) return reply.code(404).send({ error: 'Perfil de treinador não encontrado' });

    return { ...coach, totalAtletas: coach._count.atletas };
  });

  fastify.patch('/coach/perfil', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { bio, especialidade, instagram, whatsapp, cidade, estado } = req.body || {};
    const coach = await prisma.coachProfile.update({
      where: { userId: u.userId },
      data: { bio, especialidade, instagram, whatsapp, cidade, estado }
    });
    return { success: true, coach };
  });

  // ============================================================
  // COACH — DASHBOARD
  // ============================================================

  fastify.get('/coach/dashboard', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const coach = await prisma.coachProfile.findUnique({
      where: { userId: u.userId },
      include: { subscription: true }
    });
    if (!coach) return reply.code(404).send({ error: 'Perfil de treinador não encontrado. Ative em /coach/ativar' });

    // Atletas ativos vinculados diretamente
    const atletasVinculados = await prisma.coachAtleta.findMany({
      where: { coachId: coach.id, status: 'ativo' },
      include: { atleta: { select: { id: true, name: true, city: true, gender: true, age: true } } }
    });

    // Comunidades do coach
    const comunidades = await prisma.comunidade.findMany({
      where: { criadorId: u.userId },
      include: { _count: { select: { membros: { where: { status: 'ativo' } } } } }
    });

    const totalComunidades = comunidades.reduce((s, c) => s + c._count.membros, 0);
    const totalVinculados = atletasVinculados.length;
    const totalAtletas = totalVinculados + totalComunidades;
    const mensalidade = Math.round(totalAtletas * 3.99 * 100) / 100;

    return {
      coach: { id: coach.id, bio: coach.bio, especialidade: coach.especialidade },
      subscription: coach.subscription,
      totalAtletas,
      totalVinculados,
      totalComunidades,
      mensalidade,
      atletasVinculados: atletasVinculados.map(a => a.atleta),
      comunidades: comunidades.map(c => ({ nome: c.nome, slug: c.slug, membros: c._count.membros }))
    };
  });

  // ============================================================
  // COACH — GESTÃO DE ATLETAS INDIVIDUAIS
  // ============================================================

  // Listar atletas do coach (vinculados + comunidades, deduplicado)
  fastify.get('/coach/atletas', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const coach = await prisma.coachProfile.findUnique({ where: { userId: u.userId } });
    if (!coach) return reply.code(404).send({ error: 'Perfil de treinador não encontrado' });

    // Atletas vinculados diretamente
    const vinculados = await prisma.coachAtleta.findMany({
      where: { coachId: coach.id, status: 'ativo' },
      include: { atleta: { select: { id: true, name: true, email: true, city: true, gender: true, age: true, phone: true } } }
    });

    // Atletas via comunidades (membros ativos)
    const membros = await prisma.membroComunidade.findMany({
      where: { comunidade: { criadorId: u.userId }, status: 'ativo' },
      include: { user: { select: { id: true, name: true, email: true, city: true, gender: true, age: true, phone: true } } }
    });

    // Juntar e deduplicar por userId
    const vistos = new Set();
    const lista = [];

    for (const v of vinculados) {
      if (!vistos.has(v.atleta.id)) {
        vistos.add(v.atleta.id);
        lista.push({ ...v.atleta, origem: 'direto' });
      }
    }
    for (const m of membros) {
      if (!vistos.has(m.user.id)) {
        vistos.add(m.user.id);
        lista.push({ ...m.user, origem: 'comunidade' });
      }
    }

    return { total: lista.length, atletas: lista };
  });

  // Adicionar atleta individualmente (por email)
  fastify.post('/coach/atletas', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const coach = await prisma.coachProfile.findUnique({ where: { userId: u.userId } });
    if (!coach) return reply.code(404).send({ error: 'Perfil de treinador não encontrado' });

    const { email } = req.body || {};
    if (!email) return reply.code(400).send({ error: 'Email do atleta obrigatório' });

    const atleta = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!atleta) return reply.code(404).send({ error: 'Usuário não encontrado com esse email' });
    if (atleta.id === u.userId) return reply.code(400).send({ error: 'Você não pode adicionar a si mesmo' });

    const jaVinculado = await prisma.coachAtleta.findUnique({
      where: { coachId_atletaId: { coachId: coach.id, atletaId: atleta.id } }
    });
    if (jaVinculado?.status === 'ativo') return reply.code(409).send({ error: 'Atleta já vinculado' });

    await prisma.coachAtleta.upsert({
      where: { coachId_atletaId: { coachId: coach.id, atletaId: atleta.id } },
      create: { coachId: coach.id, atletaId: atleta.id, status: 'ativo' },
      update: { status: 'ativo' }
    });

    await recalcularMensalidade(coach.id);

    return { success: true, atleta: { id: atleta.id, nome: atleta.name, email: atleta.email, cidade: atleta.city } };
  });

  // Remover atleta
  fastify.delete('/coach/atletas/:atletaId', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const coach = await prisma.coachProfile.findUnique({ where: { userId: u.userId } });
    if (!coach) return reply.code(404).send({ error: 'Perfil de treinador não encontrado' });

    await prisma.coachAtleta.updateMany({
      where: { coachId: coach.id, atletaId: req.params.atletaId },
      data: { status: 'inativo' }
    });

    await recalcularMensalidade(coach.id);
    return { success: true };
  });

  // ============================================================
  // COACH — TREINOS
  // ============================================================

  // Listar treinos do coach
  fastify.get('/coach/treinos', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const comunidades = await prisma.comunidade.findMany({ where: { criadorId: u.userId } });
    const comIds = comunidades.map(c => c.id);

    const treinos = await prisma.treino.findMany({
      where: { comunidadeId: { in: comIds }, ativo: true },
      include: { comunidade: { select: { nome: true, slug: true } }, etapas: { orderBy: { ordem: 'asc' } } },
      orderBy: { createdAt: 'desc' }
    });

    return { total: treinos.length, treinos };
  });

  // Criar treino
  fastify.post('/coach/treinos', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const { nome, descricao, diaSemana, horario, local, periodo, comunidadeId } = req.body || {};
    if (!nome) return reply.code(400).send({ error: 'Nome do treino obrigatório' });

    let comId = comunidadeId;
    if (!comId) {
      const com = await prisma.comunidade.findFirst({ where: { criadorId: u.userId } });
      if (!com) return reply.code(400).send({ error: 'Crie uma comunidade primeiro' });
      comId = com.id;
    } else {
      const com = await prisma.comunidade.findFirst({ where: { id: comId, criadorId: u.userId } });
      if (!com) return reply.code(403).send({ error: 'Sem permissão nesta comunidade' });
    }

    const treino = await prisma.treino.create({
      data: {
        titulo: nome,
        descricao: descricao || '',
        comunidadeId: comId,
        diaSemana: diaSemana || null,
        horario: horario || '06:00',
        periodo: periodo || 'manha',
        local: local || null,
        recorrente: !!diaSemana
      }
    });

    return { success: true, treino };
  });

  // Salvar etapas do treino (substitui todas)
  fastify.put('/coach/treinos/:treinoId/etapas', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const treino = await prisma.treino.findUnique({
      where: { id: req.params.treinoId },
      include: { comunidade: true }
    });
    if (!treino || treino.comunidade.criadorId !== u.userId) return reply.code(403).send({ error: 'Sem permissão' });
    const { etapas } = req.body;
    if (!Array.isArray(etapas)) return reply.code(400).send({ error: 'etapas deve ser array' });
    await prisma.treinoEtapa.deleteMany({ where: { treinoId: req.params.treinoId } });
    const novas = await prisma.treinoEtapa.createMany({
      data: etapas.map((e, i) => ({
        treinoId: req.params.treinoId,
        ordem: i + 1,
        tipo: e.tipo || 'base',
        descricao: e.descricao || null,
        durMin: e.durMin ? parseInt(e.durMin) : null,
        distanciaM: e.distanciaM ? parseInt(e.distanciaM) : null,
        zonaFC: e.zonaFC ? parseInt(e.zonaFC) : null,
        paceMin: e.paceMin || null,
        paceMax: e.paceMax || null,
        repeticoes: e.repeticoes ? parseInt(e.repeticoes) : 1
      }))
    });
    return { success: true, total: novas.count };
  });

  // Editar treino
  fastify.patch('/coach/treinos/:treinoId', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const treino = await prisma.treino.findUnique({
      where: { id: req.params.treinoId },
      include: { comunidade: true }
    });
    if (!treino || treino.comunidade.criadorId !== u.userId) return reply.code(403).send({ error: 'Sem permissão' });

    const { nome, descricao, diaSemana, horario, local, periodo } = req.body || {};
    const updated = await prisma.treino.update({
      where: { id: req.params.treinoId },
      data: {
        ...(nome && { titulo: nome }),
        ...(descricao !== undefined && { descricao }),
        ...(diaSemana !== undefined && { diaSemana }),
        ...(horario && { horario }),
        ...(local !== undefined && { local }),
        ...(periodo && { periodo })
      }
    });
    return { success: true, treino: updated };
  });

  // Excluir treino
  fastify.delete('/coach/treinos/:treinoId', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const treino = await prisma.treino.findUnique({
      where: { id: req.params.treinoId },
      include: { comunidade: true }
    });
    if (!treino || treino.comunidade.criadorId !== u.userId) return reply.code(403).send({ error: 'Sem permissão' });

    await prisma.treino.update({ where: { id: req.params.treinoId }, data: { ativo: false } });
    return { success: true };
  });

  // ============================================================
  // COACH — MURAL
  // ============================================================

  fastify.post('/coach/mural', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const { texto, tipo, comunidadeId } = req.body || {};
    if (!texto) return reply.code(400).send({ error: 'Texto obrigatório' });

    let comId = comunidadeId;
    if (!comId) {
      const com = await prisma.comunidade.findFirst({ where: { criadorId: u.userId } });
      if (!com) return reply.code(400).send({ error: 'Sem comunidade' });
      comId = com.id;
    }

    const post = await prisma.mensagemComunidade.create({
      data: { conteudo: texto, tipo: tipo || 'aviso', autorId: u.userId, comunidadeId: comId }
    });
    return { success: true, post };
  });

  // Ver mural de todas as comunidades do coach
  fastify.get('/coach/mural', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const comunidades = await prisma.comunidade.findMany({ where: { criadorId: u.userId } });
    const comIds = comunidades.map(c => c.id);

    const posts = await prisma.mensagemComunidade.findMany({
      where: { comunidadeId: { in: comIds }, deletado: false },
      include: { autor: { select: { name: true } }, comunidade: { select: { nome: true } } },
      orderBy: { criadoEm: 'desc' },
      take: 50
    });

    return { posts };
  });

  // ============================================================
  // COACH — FEEDBACKS DOS ATLETAS
  // ============================================================

  fastify.get('/coach/feedbacks', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const comunidades = await prisma.comunidade.findMany({ where: { criadorId: u.userId } });
    const comIds = comunidades.map(c => c.id);

    const feedbacks = await prisma.mensagemComunidade.findMany({
      where: { comunidadeId: { in: comIds }, tipo: 'feedback', deletado: false },
      include: { autor: { select: { id: true, name: true } }, comunidade: { select: { nome: true } } },
      orderBy: { criadoEm: 'desc' },
      take: 100
    });

    return { feedbacks };
  });

  // ============================================================
  // COACH — MENSALIDADE
  // ============================================================

  fastify.get('/coach/mensalidade', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const coach = await prisma.coachProfile.findUnique({
      where: { userId: u.userId },
      include: { subscription: true }
    });
    if (!coach) return reply.code(404).send({ error: 'Perfil de treinador não encontrado' });

    const atletasVinculados = await prisma.coachAtleta.count({ where: { coachId: coach.id, status: 'ativo' } });
    const comunidades = await prisma.comunidade.findMany({
      where: { criadorId: u.userId },
      include: { _count: { select: { membros: { where: { status: 'ativo' } } } } }
    });
    const membrosComunidade = comunidades.reduce((s, c) => s + c._count.membros, 0);
    const total = atletasVinculados + membrosComunidade;
    const mensalidade = Math.round(total * 3.99 * 100) / 100;

    return {
      atletasVinculados,
      membrosComunidade,
      totalAtletas: total,
      valorPorAtleta: 3.99,
      mensalidade,
      adesao: 99.00,
      status: coach.subscription?.status || 'trial'
    };
  });

  // ============================================================
  // ATHLETE — ROTAS DO LADO DO ATLETA
  // ============================================================

  // Treino de hoje
  fastify.get('/athlete/treino-hoje', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const hoje = dias[new Date().getDay()];

    const membros = await prisma.membroComunidade.findMany({
      where: { userId: u.userId, status: 'ativo' },
      include: { comunidade: { include: { treinos: { where: { ativo: true, diaSemana: hoje } } } } }
    });

    const treinos = [];
    for (const m of membros) {
      for (const t of m.comunidade.treinos) {
        treinos.push({ id: t.id, titulo: t.titulo, horario: t.horario, local: t.local, descricao: t.descricao, grupo: m.comunidade.nome });
      }
    }

    return { dia: hoje, treinos };
  });

  // Marcar treino concluído
  fastify.post('/athlete/treino-concluido', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const { treinoId } = req.body || {};
    if (!treinoId) return reply.code(400).send({ error: 'treinoId obrigatório' });

    const membro = await prisma.membroComunidade.findFirst({ where: { userId: u.userId, status: 'ativo' } });
    if (!membro) return reply.code(400).send({ error: 'Não é membro de nenhuma comunidade' });

    // Evitar checkin duplicado no mesmo dia
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);

    const jaFez = await prisma.checkin.findFirst({
      where: { membroId: membro.id, treinoId, data: { gte: hoje, lt: amanha } }
    });
    if (jaFez) return reply.code(409).send({ error: 'Treino já marcado hoje' });

    const checkin = await prisma.checkin.create({ data: { membroId: membro.id, treinoId } });
    return { success: true, checkin };
  });

  // Enviar feedback
  fastify.post('/athlete/feedback', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const { feeling, comentario, comunidadeId } = req.body || {};
    if (!feeling) return reply.code(400).send({ error: 'Selecione como se sentiu' });

    let comId = comunidadeId;
    if (!comId) {
      const mem = await prisma.membroComunidade.findFirst({ where: { userId: u.userId, status: 'ativo' } });
      if (!mem) return reply.code(400).send({ error: 'Não é membro de nenhuma comunidade' });
      comId = mem.comunidadeId;
    }

    const msg = await prisma.mensagemComunidade.create({
      data: {
        conteudo: `${feeling} ${comentario || ''}`.trim(),
        tipo: 'feedback',
        autorId: u.userId,
        comunidadeId: comId
      }
    });
    return { success: true };
  });

  // Atleta: buscar treino completo com etapas
  fastify.get('/athlete/treino/:treinoId', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const treino = await prisma.treino.findUnique({
      where: { id: req.params.treinoId },
      include: { etapas: { orderBy: { ordem: 'asc' } }, comunidade: { select: { nome: true } } }
    });
    if (!treino) return reply.code(404).send({ error: 'Não encontrado' });
    return treino;
  });

  // Atleta: salvar FC máxima e de repouso
  fastify.patch('/athlete/perfil-fc', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { fcMax, fcRepouso } = req.body || {};
    const user = await prisma.user.update({
      where: { id: u.userId },
      data: {
        ...(fcMax && { fcMax: parseInt(fcMax) }),
        ...(fcRepouso && { fcRepouso: parseInt(fcRepouso) })
      },
      select: { fcMax: true, fcRepouso: true, age: true }
    });
    return { success: true, user };
  });

  // Histórico de treinos do atleta
  fastify.get('/athlete/historico', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const membros = await prisma.membroComunidade.findMany({ where: { userId: u.userId } });
    const membroIds = membros.map(m => m.id);

    const checkins = await prisma.checkin.findMany({
      where: { membroId: { in: membroIds } },
      include: { treino: { select: { titulo: true, horario: true, local: true, comunidade: { select: { nome: true } } } } },
      orderBy: { data: 'desc' },
      take: 30
    });

    return { total: checkins.length, checkins };
  });

  // Coach do atleta (quem te treina)
  fastify.get('/athlete/meu-coach', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const vinculo = await prisma.coachAtleta.findFirst({
      where: { atletaId: u.userId, status: 'ativo' },
      include: { coach: { include: { user: { select: { name: true, city: true, phone: true } } } } }
    });

    if (!vinculo) return { coach: null };

    return {
      coach: {
        nome: vinculo.coach.user.name,
        bio: vinculo.coach.bio,
        especialidade: vinculo.coach.especialidade,
        instagram: vinculo.coach.instagram,
        whatsapp: vinculo.coach.whatsapp,
        cidade: vinculo.coach.cidade
      }
    };
  });
}
