import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT = process.env.JWT_SECRET || 'pace-secret-2026';

function getUser(req) {
  try { return jwt.verify(req.headers.authorization?.replace('Bearer ', ''), JWT); }
  catch { return null; }
}

const CONQUISTAS = [
  { checkins: 5, tipo: 'checkin_5', titulo: '🔥 Esquentando', desc: 'Completou 5 treinos', icone: '🔥', pontos: 50 },
  { checkins: 10, tipo: 'checkin_10', titulo: '⚡ Consistente', desc: 'Completou 10 treinos', icone: '⚡', pontos: 100 },
  { checkins: 25, tipo: 'checkin_25', titulo: '🏆 Dedicado', desc: 'Completou 25 treinos', icone: '🏆', pontos: 250 },
  { checkins: 50, tipo: 'checkin_50', titulo: '👑 Veterano', desc: 'Completou 50 treinos', icone: '👑', pontos: 500 },
  { checkins: 100, tipo: 'lenda_chiara', titulo: '🌟 Lenda do Chiara', desc: '100 treinos no Chiara Lubich!', icone: '🌟', pontos: 1000 },
];

async function verificarConquistas(userId, membroId) {
  const totalCheckins = await prisma.checkin.count({ where: { membroId } });
  for (const c of CONQUISTAS) {
    if (totalCheckins >= c.checkins) {
      await prisma.conquista.upsert({
        where: { userId_tipo: { userId, tipo: c.tipo } },
        create: { userId, tipo: c.tipo, titulo: c.titulo, descricao: c.desc, icone: c.icone, pontosGanhos: c.pontos },
        update: {}
      });
    }
  }
  await prisma.pontosUsuario.upsert({
    where: { userId },
    create: { userId, total: totalCheckins * 10, checkins: totalCheckins },
    update: { total: totalCheckins * 10, checkins: totalCheckins }
  });
}

export async function comunidadeRoutes(fastify) {

  // LISTAR COMUNIDADES
  fastify.get('/comunidades', async (req) => {
    const { cidade, estado } = req.query;
    const where = { ativa: true };
    if (cidade) where.cidade = cidade;
    if (estado) where.estado = estado;
    const comunidades = await prisma.comunidade.findMany({
      where,
      include: { _count: { select: { membros: true } }, treinos: { where: { ativo: true }, select: { id: true, diaSemana: true, horario: true, periodo: true, titulo: true } } },
      orderBy: { createdAt: 'desc' }
    });
    return comunidades.map(c => ({ ...c, totalMembros: c._count.membros, _count: undefined }));
  });

  // DETALHES
  fastify.get('/comunidades/:slug', async (req, reply) => {
    const c = await prisma.comunidade.findUnique({
      where: { slug: req.params.slug },
      include: {
        criador: { select: { name: true, photo: true } },
        _count: { select: { membros: true } },
        treinos: { where: { ativo: true } },
        membros: { include: { user: { select: { id: true, name: true, photo: true } }, _count: { select: { checkins: true } } }, take: 100 },
        muralFotos: { orderBy: { data: 'desc' }, take: 20, include: { user: { select: { name: true } } } }
      }
    });
    if (!c) return reply.code(404).send({ error: 'Comunidade não encontrada' });

    // Ranking por checkins
    const membrosOrdenados = c.membros
      .map(m => ({ nome: m.user.name, foto: m.user.photo, checkins: m._count.checkins, role: m.role, userId: m.user.id }))
      .sort((a, b) => b.checkins - a.checkins);

    return { ...c, totalMembros: c._count.membros, ranking: membrosOrdenados };
  });

  // CRIAR COMUNIDADE (qualquer usuário logado)
  fastify.post('/comunidades', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { nome, descricao, tipo, generoRestrito, local, cidade, estado, cor } = req.body || {};
    if (!nome || !descricao) return reply.code(400).send({ error: 'Nome e descrição obrigatórios' });
    const slug = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const existe = await prisma.comunidade.findUnique({ where: { slug } });
    if (existe) return reply.code(409).send({ error: 'Já existe uma comunidade com esse nome' });
    const comunidade = await prisma.comunidade.create({
      data: { nome, slug, descricao, tipo: tipo || 'aberto', generoRestrito: generoRestrito || null, local, cidade, estado, cor: cor || '#10B981', criadorId: u.userId }
    });
    await prisma.membroComunidade.create({ data: { userId: u.userId, comunidadeId: comunidade.id, role: 'admin' } });
    return comunidade;
  });

  // ENTRAR
  fastify.post('/comunidades/:slug/entrar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const comunidade = await prisma.comunidade.findUnique({ where: { slug: req.params.slug } });
    if (!comunidade) return reply.code(404).send({ error: 'Comunidade não encontrada' });
    if (comunidade.generoRestrito) {
      const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { gender: true } });
      if (user?.gender !== comunidade.generoRestrito) return reply.code(403).send({ error: 'Esta comunidade é exclusiva para o público feminino 💜' });
    }
    const jaMembro = await prisma.membroComunidade.findUnique({ where: { userId_comunidadeId: { userId: u.userId, comunidadeId: comunidade.id } } });
    if (jaMembro) return reply.code(409).send({ error: 'Você já faz parte!' });
    const membro = await prisma.membroComunidade.create({ data: { userId: u.userId, comunidadeId: comunidade.id } });
    return { success: true, message: `Bem-vindo(a) ao ${comunidade.nome}! 🏃`, membro };
  });

  // SAIR
  fastify.delete('/comunidades/:slug/sair', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const comunidade = await prisma.comunidade.findUnique({ where: { slug: req.params.slug } });
    if (!comunidade) return reply.code(404).send({ error: 'Comunidade não encontrada' });
    await prisma.membroComunidade.deleteMany({ where: { userId: u.userId, comunidadeId: comunidade.id } });
    return { success: true };
  });

  // CONFIRMAR PRESENÇA
  fastify.post('/treinos/:treinoId/confirmar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const treino = await prisma.treino.findUnique({ where: { id: req.params.treinoId } });
    if (!treino) return reply.code(404).send({ error: 'Treino não encontrado' });
    const membro = await prisma.membroComunidade.findUnique({ where: { userId_comunidadeId: { userId: u.userId, comunidadeId: treino.comunidadeId } } });
    if (!membro) return reply.code(403).send({ error: 'Entre na comunidade primeiro' });
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const confirmacao = await prisma.confirmacaoTreino.upsert({
      where: { userId_treinoId_data: { userId: u.userId, treinoId: treino.id, data: hoje } },
      create: { userId: u.userId, treinoId: treino.id, data: hoje }, update: { status: 'confirmado' }
    });
    const totalConfirmados = await prisma.confirmacaoTreino.count({ where: { treinoId: treino.id, data: hoje, status: 'confirmado' } });
    return { success: true, totalConfirmados, message: `${totalConfirmados} pessoas confirmadas! 🔥` };
  });

  // VER CONFIRMADOS
  fastify.get('/treinos/:treinoId/confirmados', async (req) => {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const confirmados = await prisma.confirmacaoTreino.findMany({
      where: { treinoId: req.params.treinoId, data: hoje, status: 'confirmado' },
      include: { user: { select: { name: true, photo: true } } }
    });
    return { total: confirmados.length, confirmados };
  });

  // CHECK-IN
  fastify.post('/treinos/:treinoId/checkin', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const treino = await prisma.treino.findUnique({ where: { id: req.params.treinoId } });
    if (!treino) return reply.code(404).send({ error: 'Treino não encontrado' });
    const membro = await prisma.membroComunidade.findUnique({ where: { userId_comunidadeId: { userId: u.userId, comunidadeId: treino.comunidadeId } } });
    if (!membro) return reply.code(403).send({ error: 'Entre na comunidade primeiro' });
    const checkin = await prisma.checkin.create({ data: { membroId: membro.id, treinoId: treino.id } });
    await verificarConquistas(u.userId, membro.id);
    const totalCheckins = await prisma.checkin.count({ where: { membroId: membro.id } });
    return { success: true, totalCheckins, message: `Check-in! Total: ${totalCheckins} treinos 💪` };
  });

  // RANKING CHECKINS
  fastify.get('/comunidades/:slug/ranking', async (req) => {
    const comunidade = await prisma.comunidade.findUnique({ where: { slug: req.params.slug } });
    if (!comunidade) return [];
    const membros = await prisma.membroComunidade.findMany({
      where: { comunidadeId: comunidade.id },
      include: { user: { select: { name: true, photo: true } }, _count: { select: { checkins: true } } }
    });
    return membros.map((m, i) => ({ nome: m.user.name, foto: m.user.photo, checkins: m._count.checkins, role: m.role }))
      .sort((a, b) => b.checkins - a.checkins)
      .map((m, i) => ({ posicao: i + 1, ...m }));
  });

  // MURAL FOTOS
  fastify.get('/comunidades/:slug/fotos', async (req) => {
    const comunidade = await prisma.comunidade.findUnique({ where: { slug: req.params.slug } });
    if (!comunidade) return [];
    return prisma.muralFoto.findMany({ where: { comunidadeId: comunidade.id }, include: { user: { select: { name: true, photo: true } } }, orderBy: { data: 'desc' }, take: 50 });
  });

  // CONQUISTAS
  fastify.get('/conquistas', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const [conquistas, pontos] = await Promise.all([
      prisma.conquista.findMany({ where: { userId: u.userId }, orderBy: { desbloqueadoEm: 'desc' } }),
      prisma.pontosUsuario.findUnique({ where: { userId: u.userId } })
    ]);
    return { conquistas, pontos: pontos?.total || 0, descontoLoja: Math.min(Math.floor((pontos?.total || 0) / 10), 30) };
  });

  // PONTOS
  fastify.get('/pontos', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const pontos = await prisma.pontosUsuario.findUnique({ where: { userId: u.userId } });
    const total = pontos?.total || 0;
    return { total, descontoReais: Math.min(Math.floor(total / 10), 30) };
  });
}
