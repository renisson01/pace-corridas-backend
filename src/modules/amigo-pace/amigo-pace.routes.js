import prisma from '../../lib/prisma.js';
import jwt from 'jsonwebtoken';

const JWT = process.env.JWT_SECRET || 'pace-secret-2026';

function getUser(req) {
  try { return jwt.verify(req.headers.authorization?.replace('Bearer ', ''), JWT); }
  catch { return null; }
}

function paceToSeg(pace) {
  if (!pace) return 0;
  const [min, seg] = pace.split(':').map(Number);
  return (min * 60) + (seg || 0);
}

function calcScore(eu, outro) {
  let score = 0;
  if (eu.city && outro.city && eu.city.toLowerCase() === outro.city.toLowerCase()) score += 40;
  else if (eu.state && outro.state && eu.state === outro.state) score += 15;
  if (eu.paceMedio && outro.paceMedio) {
    const diff = Math.abs(paceToSeg(eu.paceMedio) - paceToSeg(outro.paceMedio));
    if (diff <= 30) score += 30;
    else if (diff <= 60) score += 20;
    else if (diff <= 120) score += 10;
  } else { score += 15; }
  if (eu.gender && outro.gender && eu.gender === outro.gender) score += 10;
  else score += 5;
  if (eu.equipe && outro.equipe && eu.equipe === outro.equipe) score += 20;
  else score += 10;
  return Math.min(score, 100);
}

export async function amigoPaceRoutes(fastify) {

  fastify.get('/amigo-pace/sugestoes', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const eu = await prisma.user.findUnique({ where: { id: u.userId }, select: { id: true, city: true, state: true, gender: true, equipe: true } });
    if (!eu) return reply.code(404).send({ error: 'Usuário não encontrado' });
    const jaRelacionados = await prisma.amigoPace.findMany({ where: { OR: [{ enviadoPor: u.userId }, { recebidoPor: u.userId }] }, select: { enviadoPor: true, recebidoPor: true } });
    const excluir = new Set([u.userId]);
    jaRelacionados.forEach(r => { excluir.add(r.enviadoPor); excluir.add(r.recebidoPor); });
    const candidatos = await prisma.user.findMany({
      where: { id: { notIn: [...excluir] }, OR: [{ city: eu.city || undefined }, { state: eu.state || undefined }] },
      select: { id: true, name: true, photo: true, city: true, state: true, gender: true, equipe: true, bio: true, _count: { select: { atividadesGPS: true } } },
      take: 50
    });
    return candidatos.map(c => ({ ...c, score: calcScore(eu, c) })).filter(c => c.score >= 20).sort((a, b) => b.score - a.score).slice(0, 20);
  });

  fastify.post('/amigo-pace/solicitar/:userId', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    if (u.userId === req.params.userId) return reply.code(400).send({ error: 'Você não pode se adicionar!' });
    const { mensagem } = req.body || {};
    const jaExiste = await prisma.amigoPace.findFirst({ where: { OR: [{ enviadoPor: u.userId, recebidoPor: req.params.userId }, { enviadoPor: req.params.userId, recebidoPor: u.userId }] } });
    if (jaExiste) {
      if (jaExiste.status === 'aceito') return reply.code(409).send({ error: 'Já são AmigoPace! 🤝' });
      if (jaExiste.status === 'pendente') return reply.code(409).send({ error: 'Solicitação já enviada ⏳' });
      if (jaExiste.status === 'bloqueado') return reply.code(403).send({ error: 'Não é possível adicionar este atleta.' });
    }
    const solicitacao = await prisma.amigoPace.create({ data: { enviadoPor: u.userId, recebidoPor: req.params.userId, mensagem: mensagem || null } });
    return { success: true, message: 'Solicitação enviada! 🏃', solicitacao };
  });

  fastify.patch('/amigo-pace/:id/responder', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { acao } = req.body || {};
    if (!['aceitar', 'recusar'].includes(acao)) return reply.code(400).send({ error: 'Ação inválida' });
    const solicitacao = await prisma.amigoPace.findUnique({ where: { id: req.params.id } });
    if (!solicitacao) return reply.code(404).send({ error: 'Solicitação não encontrada' });
    if (solicitacao.recebidoPor !== u.userId) return reply.code(403).send({ error: 'Sem permissão' });
    if (solicitacao.status !== 'pendente') return reply.code(409).send({ error: 'Solicitação já respondida' });
    const novo = await prisma.amigoPace.update({ where: { id: req.params.id }, data: { status: acao === 'aceitar' ? 'aceito' : 'recusado' } });
    return { success: true, status: novo.status, message: acao === 'aceitar' ? 'Vocês agora são AmigoPace! 🤝🏃' : 'Solicitação recusada.' };
  });

  fastify.get('/amigo-pace/amigos', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const amizades = await prisma.amigoPace.findMany({
      where: { status: 'aceito', OR: [{ enviadoPor: u.userId }, { recebidoPor: u.userId }] },
      include: { enviou: { select: { id: true, name: true, photo: true, city: true, state: true, equipe: true } }, recebeu: { select: { id: true, name: true, photo: true, city: true, state: true, equipe: true } } }
    });
    return amizades.map(a => ({ id: a.id, amigo: a.enviadoPor === u.userId ? a.recebeu : a.enviou, desde: a.criadoEm }));
  });

  fastify.get('/amigo-pace/pendentes', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const pendentes = await prisma.amigoPace.findMany({
      where: { recebidoPor: u.userId, status: 'pendente' },
      include: { enviou: { select: { id: true, name: true, photo: true, city: true, state: true, equipe: true } } },
      orderBy: { criadoEm: 'desc' }
    });
    return pendentes.map(p => ({ id: p.id, quemPediu: p.enviou, mensagem: p.mensagem, quando: p.criadoEm }));
  });

  fastify.delete('/amigo-pace/:userId', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    await prisma.amigoPace.deleteMany({ where: { status: 'aceito', OR: [{ enviadoPor: u.userId, recebidoPor: req.params.userId }, { enviadoPor: req.params.userId, recebidoPor: u.userId }] } });
    return { success: true };
  });

  fastify.post('/amigo-pace/grupos', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { nome, descricao, ritmoMin, ritmoMax, nivel, cidade, estado, privado, maxMembros } = req.body || {};
    if (!nome) return reply.code(400).send({ error: 'Nome do grupo obrigatório' });
    const grupo = await prisma.grupoTreino.create({ data: { nome, descricao: descricao || null, ritmoMin: ritmoMin || null, ritmoMax: ritmoMax || null, nivel: nivel || 'todos', cidade: cidade || null, estado: estado || null, criadorId: u.userId, privado: privado || false, maxMembros: maxMembros || 20 } });
    await prisma.membroGrupoTreino.create({ data: { userId: u.userId, grupoId: grupo.id, role: 'admin', status: 'ativo' } });
    return grupo;
  });

  fastify.get('/amigo-pace/grupos', async (req) => {
    const { cidade, estado, nivel } = req.query;
    const where = { ativo: true, privado: false };
    if (cidade) where.cidade = cidade;
    if (estado) where.estado = estado;
    if (nivel && nivel !== 'todos') where.nivel = nivel;
    const grupos = await prisma.grupoTreino.findMany({ where, include: { criador: { select: { name: true, photo: true } }, _count: { select: { membros: { where: { status: 'ativo' } } } } }, orderBy: { criadoEm: 'desc' } });
    return grupos.map(g => ({ ...g, totalMembros: g._count.membros, _count: undefined }));
  });

  fastify.post('/amigo-pace/grupos/:id/entrar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const grupo = await prisma.grupoTreino.findUnique({ where: { id: req.params.id } });
    if (!grupo) return reply.code(404).send({ error: 'Grupo não encontrado' });
    const jaMembro = await prisma.membroGrupoTreino.findUnique({ where: { userId_grupoId: { userId: u.userId, grupoId: grupo.id } } });
    if (jaMembro?.status === 'ativo') return reply.code(409).send({ error: 'Você já faz parte deste grupo!' });
    const totalMembros = await prisma.membroGrupoTreino.count({ where: { grupoId: grupo.id, status: 'ativo' } });
    if (totalMembros >= grupo.maxMembros) return reply.code(409).send({ error: 'Grupo cheio! 😅' });
    await prisma.membroGrupoTreino.upsert({ where: { userId_grupoId: { userId: u.userId, grupoId: grupo.id } }, create: { userId: u.userId, grupoId: grupo.id, status: 'ativo' }, update: { status: 'ativo' } });
    return { success: true, message: `Bem-vindo ao grupo ${grupo.nome}! 🏃` };
  });

  fastify.get('/amigo-pace/grupos/:id', async (req, reply) => {
    const grupo = await prisma.grupoTreino.findUnique({ where: { id: req.params.id }, include: { criador: { select: { name: true, photo: true } }, membros: { where: { status: 'ativo' }, include: { user: { select: { id: true, name: true, photo: true, city: true, equipe: true } } } } } });
    if (!grupo) return reply.code(404).send({ error: 'Grupo não encontrado' });
    return grupo;
  });

  fastify.get('/amigo-pace/status/:userId', async (req, reply) => {
    const u = getUser(req);
    if (!u) return { status: 'desconhecido' };
    const rel = await prisma.amigoPace.findFirst({ where: { OR: [{ enviadoPor: u.userId, recebidoPor: req.params.userId }, { enviadoPor: req.params.userId, recebidoPor: u.userId }] } });
    if (!rel) return { status: 'nenhum' };
    return { status: rel.status, fui_eu_que_enviei: rel.enviadoPor === u.userId, id: rel.id };
  });
}
