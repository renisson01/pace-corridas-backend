import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();
import jwt from 'jsonwebtoken';
const SECRET = process.env.JWT_SECRET || 'pace-secret-2026';

function auth(req) {
  const t = req.headers.authorization?.replace('Bearer ', '');
  if (!t) return null;
  try { return jwt.verify(t, SECRET); } catch { return null; }
}

export async function coachRoutes(fastify) {

  // Dashboard do coach
  fastify.get('/coach/dashboard', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Nao autorizado' });
    const coms = await prisma.comunidade.findMany({
      where: { criadorId: u.userId },
      include: { _count: { select: { membros: true } } }
    });
    const total = coms.reduce((s, c) => s + c._count.membros, 0);
    return {
      totalAlunos: total,
      totalGrupos: coms.length,
      mensalidade: Math.round(total * 3.99 * 100) / 100,
      grupos: coms.map(c => ({ nome: c.nome, slug: c.slug, membros: c._count.membros }))
    };
  });

  // Lista de alunos do coach
  fastify.get('/coach/alunos', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Nao autorizado' });
    const m = await prisma.membroComunidade.findMany({
      where: { comunidade: { criadorId: u.userId } },
      include: { user: { select: { id: true, name: true, email: true, gender: true, city: true } } }
    });
    return m.map(x => ({
      id: x.user.id,
      nome: x.user.name,
      email: x.user.email,
      genero: x.user.gender,
      cidade: x.user.city,
      role: x.role
    }));
  });

  // Criar treino — FIX: pega a primeira comunidade do coach como referência
  fastify.post('/coach/treinos', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Nao autorizado' });
    const { nome, descricao, tipo, comunidadeId } = req.body;

    // Busca primeira comunidade do coach se não informada
    let comId = comunidadeId;
    if (!comId) {
      const com = await prisma.comunidade.findFirst({ where: { criadorId: u.userId } });
      if (!com) return reply.code(400).send({ error: 'Crie uma comunidade primeiro' });
      comId = com.id;
    }

    const t = await prisma.treino.create({
      data: {
        titulo: nome || 'Treino',
        descricao: descricao || '',
        comunidadeId: comId,
        diaSemana: req.body.diaSemana || null,
        horario: req.body.horario || '06:00',  // FIX: horario é NOT NULL no schema
        periodo: tipo || 'manha',
        local: req.body.local || null,
        recorrente: false
      }
    });
    return { success: true, treino: t };
  });

  // Postar no mural — FIX: campo autorId (não userId)
  fastify.post('/coach/mural', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Nao autorizado' });
    const { texto, tipo, comunidadeId } = req.body;
    if (!texto) return reply.code(400).send({ error: 'Texto obrigatorio' });

    // Pega comunidade do coach se não informada
    let comId = comunidadeId;
    if (!comId) {
      const com = await prisma.comunidade.findFirst({ where: { criadorId: u.userId } });
      if (!com) return reply.code(400).send({ error: 'Sem comunidade' });
      comId = com.id;
    }

    const p = await prisma.mensagemComunidade.create({
      data: {
        conteudo: texto,
        tipo: tipo || 'aviso',
        autorId: u.userId,        // FIX: era userId, correto é autorId
        comunidadeId: comId
      }
    });
    return { success: true, post: p };
  });

  // Mensalidade estimada
  fastify.get('/coach/mensalidade', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Nao autorizado' });
    const coms = await prisma.comunidade.findMany({
      where: { criadorId: u.userId },
      include: { _count: { select: { membros: true } } }
    });
    const t = coms.reduce((s, c) => s + c._count.membros, 0);
    return { atletasAtivos: t, valorPorAtleta: 3.99, mensalidade: Math.round(t * 3.99 * 100) / 100, adesao: 99.00 };
  });

  // Treino do dia para o aluno
  fastify.get('/athlete/treino-hoje', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Nao autorizado' });
    const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const d = dias[new Date().getDay()];
    const m = await prisma.membroComunidade.findMany({
      where: { userId: u.userId },
      include: { comunidade: { include: { treinos: { where: { ativo: true } } } } }
    });
    const tr = [];
    for (const x of m) {
      for (const t of x.comunidade.treinos) {
        if (t.diaSemana === d) tr.push({ id: t.id, titulo: t.titulo, horario: t.horario, grupo: x.comunidade.nome });
      }
    }
    return { dia: d, treinos: tr };
  });

  // Marcar treino como concluído — FIX: Checkin usa membroId não userId
  fastify.post('/athlete/treino-concluido', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Nao autorizado' });
    const { treinoId } = req.body;
    if (!treinoId) return reply.code(400).send({ error: 'treinoId obrigatorio' });

    // Busca o membroId do usuário
    const membro = await prisma.membroComunidade.findFirst({
      where: { userId: u.userId }
    });
    if (!membro) return reply.code(400).send({ error: 'Usuario nao e membro de nenhuma comunidade' });

    const c = await prisma.checkin.create({
      data: {
        membroId: membro.id,   // FIX: era userId, correto é membroId
        treinoId: treinoId
      }
    });
    return { success: true, checkin: c };
  });

  // Feedback do aluno sobre treino
  fastify.post('/athlete/feedback', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Nao autorizado' });
    const { treinoId, feeling, comentario, comunidadeId } = req.body;

    let comId = comunidadeId;
    if (!comId) {
      const mem = await prisma.membroComunidade.findFirst({ where: { userId: u.userId } });
      if (!mem) return reply.code(400).send({ error: 'Sem comunidade' });
      comId = mem.comunidadeId;
    }

    const msg = await prisma.mensagemComunidade.create({
      data: {
        conteudo: `${feeling || '😊'} ${comentario || ''}`.trim(),
        tipo: 'feedback',
        autorId: u.userId,
        comunidadeId: comId
      }
    });
    return { success: true, feedback: msg };
  });
}
