import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT = process.env.JWT_SECRET || 'pace-secret-2026';

function getUser(req) {
  try { return jwt.verify(req.headers.authorization?.replace('Bearer ', ''), JWT); }
  catch { return null; }
}

async function isAdminComunidade(userId, comunidadeId) {
  const m = await prisma.membroComunidade.findUnique({
    where: { userId_comunidadeId: { userId, comunidadeId } }
  });
  return m?.role === 'admin' && m?.status === 'ativo';
}

async function isMembroAtivo(userId, comunidadeId) {
  const m = await prisma.membroComunidade.findUnique({
    where: { userId_comunidadeId: { userId, comunidadeId } }
  });
  return m?.status === 'ativo';
}

const CONQUISTAS = [
  { checkins: 5,   tipo: 'checkin_5',    titulo: '🔥 Esquentando',    desc: 'Completou 5 treinos',   icone: '🔥', pontos: 50   },
  { checkins: 10,  tipo: 'checkin_10',   titulo: '⚡ Consistente',     desc: 'Completou 10 treinos',  icone: '⚡', pontos: 100  },
  { checkins: 25,  tipo: 'checkin_25',   titulo: '🏆 Dedicado',        desc: 'Completou 25 treinos',  icone: '🏆', pontos: 250  },
  { checkins: 50,  tipo: 'checkin_50',   titulo: '👑 Veterano',        desc: 'Completou 50 treinos',  icone: '👑', pontos: 500  },
  { checkins: 100, tipo: 'lenda_chiara', titulo: '🌟 Lenda do Chiara', desc: '100 treinos no Chiara!',icone: '🌟', pontos: 1000 },
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

  fastify.get('/comunidades', async (req) => {
    const { cidade, estado } = req.query;
    const where = { ativa: true };
    if (cidade) where.cidade = cidade;
    if (estado) where.estado = estado;
    const comunidades = await prisma.comunidade.findMany({
      where,
      include: {
        _count: { select: { membros: { where: { status: 'ativo' } } } },
        treinos: { where: { ativo: true }, select: { id: true, diaSemana: true, horario: true, periodo: true, titulo: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    return comunidades.map(c => ({ ...c, totalMembros: c._count.membros, _count: undefined }));
  });

  fastify.get('/comunidades/:slug', async (req, reply) => {
    const u = getUser(req);
    const c = await prisma.comunidade.findUnique({
      where: { slug: req.params.slug },
      include: {
        criador: { select: { name: true, photo: true } },
        _count: { select: { membros: { where: { status: 'ativo' } } } },
        treinos: { where: { ativo: true } },
        membros: {
          where: { status: 'ativo' },
          include: { user: { select: { id: true, name: true, photo: true } }, _count: { select: { checkins: true } } },
          take: 100
        },
        muralFotos: { orderBy: { data: 'desc' }, take: 20, include: { user: { select: { name: true } } } }
      }
    });
    if (!c) return reply.code(404).send({ error: 'Comunidade não encontrada' });

    const membrosOrdenados = c.membros
      .map(m => ({ nome: m.user.name, foto: m.user.photo, checkins: m._count.checkins, role: m.role, userId: m.user.id }))
      .sort((a, b) => b.checkins - a.checkins);

    let meuStatus = 'visitante';
    if (u) {
      const membro = await prisma.membroComunidade.findUnique({
        where: { userId_comunidadeId: { userId: u.userId, comunidadeId: c.id } }
      });
      if (membro) meuStatus = membro.role === 'admin' ? 'admin' : membro.status;
    }

    return { ...c, totalMembros: c._count.membros, ranking: membrosOrdenados, meuStatus };
  });

  fastify.post('/comunidades', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { nome, descricao, tipo, generoRestrito, local, cidade, estado, cor, fechado } = req.body || {};
    if (!nome || !descricao) return reply.code(400).send({ error: 'Nome e descrição obrigatórios' });
    const slug = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const existe = await prisma.comunidade.findUnique({ where: { slug } });
    if (existe) return reply.code(409).send({ error: 'Já existe uma comunidade com esse nome' });
    const comunidade = await prisma.comunidade.create({
      data: { nome, slug, descricao, tipo: tipo || 'aberto', generoRestrito: generoRestrito || null, local, cidade, estado, cor: cor || '#10B981', criadorId: u.userId, fechado: fechado || false, aprovacaoManual: fechado || false }
    });
    await prisma.membroComunidade.create({ data: { userId: u.userId, comunidadeId: comunidade.id, role: 'admin', status: 'ativo' } });
    return comunidade;
  });

  fastify.post('/comunidades/:slug/entrar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const comunidade = await prisma.comunidade.findUnique({ where: { slug: req.params.slug } });
    if (!comunidade) return reply.code(404).send({ error: 'Comunidade não encontrada' });
    if (comunidade.generoRestrito) {
      const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { gender: true } });
      if (user?.gender !== comunidade.generoRestrito) return reply.code(403).send({ error: 'Esta comunidade é exclusiva para o público feminino 💜' });
    }
    const jaMembro = await prisma.membroComunidade.findUnique({
      where: { userId_comunidadeId: { userId: u.userId, comunidadeId: comunidade.id } }
    });
    if (jaMembro?.status === 'ativo')    return reply.code(409).send({ error: 'Você já faz parte!' });
    if (jaMembro?.status === 'pendente') return reply.code(409).send({ error: 'Sua solicitação já está em análise ⏳' });
    if (jaMembro?.status === 'banido')   return reply.code(403).send({ error: 'Você não pode entrar neste grupo.' });
    const { mensagemEntrada } = req.body || {};
    const statusInicial = comunidade.aprovacaoManual ? 'pendente' : 'ativo';
    const membro = await prisma.membroComunidade.upsert({
      where: { userId_comunidadeId: { userId: u.userId, comunidadeId: comunidade.id } },
      create: { userId: u.userId, comunidadeId: comunidade.id, status: statusInicial, mensagemEntrada },
      update: { status: statusInicial, mensagemEntrada }
    });
    if (comunidade.aprovacaoManual) return { success: true, status: 'pendente', message: 'Solicitação enviada! Aguarde a aprovação 🙏' };
    return { success: true, status: 'ativo', message: `Bem-vindo(a) ao ${comunidade.nome}! 🏃`, membro };
  });

  fastify.delete('/comunidades/:slug/sair', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const comunidade = await prisma.comunidade.findUnique({ where: { slug: req.params.slug } });
    if (!comunidade) return reply.code(404).send({ error: 'Comunidade não encontrada' });
    await prisma.membroComunidade.deleteMany({ where: { userId: u.userId, comunidadeId: comunidade.id } });
    return { success: true };
  });

  fastify.get('/comunidades/:slug/painel', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const c = await prisma.comunidade.findUnique({ where: { slug: req.params.slug } });
    if (!c) return reply.code(404).send({ error: 'Não encontrada' });
    if (!await isAdminComunidade(u.userId, c.id)) return reply.code(403).send({ error: 'Sem permissão' });
    const [pendentes, ativos] = await Promise.all([
      prisma.membroComunidade.findMany({
        where: { comunidadeId: c.id, status: 'pendente' },
        include: { user: { select: { id: true, name: true, photo: true, city: true } } },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.membroComunidade.findMany({
        where: { comunidadeId: c.id, status: 'ativo' },
        include: { user: { select: { id: true, name: true, photo: true } }, _count: { select: { checkins: true } } },
        orderBy: { createdAt: 'desc' }
      })
    ]);
    return { pendentes, ativos, totalPendentes: pendentes.length, totalAtivos: ativos.length };
  });

  fastify.patch('/comunidades/:slug/membros/:userId/aprovar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const c = await prisma.comunidade.findUnique({ where: { slug: req.params.slug } });
    if (!c || !await isAdminComunidade(u.userId, c.id)) return reply.code(403).send({ error: 'Sem permissão' });
    await prisma.membroComunidade.update({
      where: { userId_comunidadeId: { userId: req.params.userId, comunidadeId: c.id } },
      data: { status: 'ativo' }
    });
    return { success: true, message: 'Membro aprovado! ✅' };
  });

  fastify.patch('/comunidades/:slug/membros/:userId/remover', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const c = await prisma.comunidade.findUnique({ where: { slug: req.params.slug } });
    if (!c || !await isAdminComunidade(u.userId, c.id)) return reply.code(403).send({ error: 'Sem permissão' });
    const { banir } = req.body || {};
    await prisma.membroComunidade.update({
      where: { userId_comunidadeId: { userId: req.params.userId, comunidadeId: c.id } },
      data: { status: banir ? 'banido' : 'rejeitado' }
    });
    return { success: true };
  });

  fastify.patch('/comunidades/:slug/configurar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const c = await prisma.comunidade.findUnique({ where: { slug: req.params.slug } });
    if (!c || !await isAdminComunidade(u.userId, c.id)) return reply.code(403).send({ error: 'Sem permissão' });
    const { fechado, aprovacaoManual, nome, descricao, cor } = req.body || {};
    const updated = await prisma.comunidade.update({
      where: { id: c.id },
      data: {
        ...(fechado !== undefined && { fechado, aprovacaoManual: fechado }),
        ...(nome && { nome }),
        ...(descricao && { descricao }),
        ...(cor && { cor }),
      }
    });
    return { success: true, comunidade: updated };
  });

  fastify.get('/comunidades/:slug/chat', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const c = await prisma.comunidade.findUnique({ where: { slug: req.params.slug } });
    if (!c) return reply.code(404).send({ error: 'Não encontrada' });
    if (!await isMembroAtivo(u.userId, c.id)) return reply.code(403).send({ error: 'Apenas membros ativos' });
    const { limit = 50 } = req.query;
    const msgs = await prisma.mensagemComunidade.findMany({
      where: { comunidadeId: c.id, deletado: false },
      include: { autor: { select: { id: true, name: true, photo: true } } },
      orderBy: { criadoEm: 'desc' },
      take: Number(limit)
    });
    return msgs.reverse();
  });

  fastify.post('/comunidades/:slug/chat', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const c = await prisma.comunidade.findUnique({ where: { slug: req.params.slug } });
    if (!c) return reply.code(404).send({ error: 'Não encontrada' });
    if (!await isMembroAtivo(u.userId, c.id)) return reply.code(403).send({ error: 'Apenas membros ativos' });
    const { conteudo, tipo = 'texto', midiaUrl } = req.body || {};
    if (!conteudo?.trim() && !midiaUrl) return reply.code(400).send({ error: 'Mensagem vazia' });
    const msg = await prisma.mensagemComunidade.create({
      data: { comunidadeId: c.id, autorId: u.userId, conteudo: conteudo || '', tipo, midiaUrl },
      include: { autor: { select: { id: true, name: true, photo: true } } }
    });
    return msg;
  });

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
      create: { userId: u.userId, treinoId: treino.id, data: hoje },
      update: { status: 'confirmado' }
    });
    const totalConfirmados = await prisma.confirmacaoTreino.count({ where: { treinoId: treino.id, data: hoje, status: 'confirmado' } });
    return { success: true, totalConfirmados, message: `${totalConfirmados} pessoas confirmadas! 🔥` };
  });

  fastify.get('/treinos/:treinoId/confirmados', async (req) => {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const confirmados = await prisma.confirmacaoTreino.findMany({
      where: { treinoId: req.params.treinoId, data: hoje, status: 'confirmado' },
      include: { user: { select: { name: true, photo: true } } }
    });
    return { total: confirmados.length, confirmados };
  });

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

  fastify.get('/comunidades/:slug/ranking', async (req) => {
    const comunidade = await prisma.comunidade.findUnique({ where: { slug: req.params.slug } });
    if (!comunidade) return [];
    const membros = await prisma.membroComunidade.findMany({
      where: { comunidadeId: comunidade.id, status: 'ativo' },
      include: { user: { select: { name: true, photo: true } }, _count: { select: { checkins: true } } }
    });
    return membros.map(m => ({ nome: m.user.name, foto: m.user.photo, checkins: m._count.checkins, role: m.role }))
      .sort((a, b) => b.checkins - a.checkins)
      .map((m, i) => ({ posicao: i + 1, ...m }));
  });

  fastify.get('/comunidades/:slug/fotos', async (req) => {
    const comunidade = await prisma.comunidade.findUnique({ where: { slug: req.params.slug } });
    if (!comunidade) return [];
    return prisma.muralFoto.findMany({ where: { comunidadeId: comunidade.id }, include: { user: { select: { name: true, photo: true } } }, orderBy: { data: 'desc' }, take: 50 });
  });

  fastify.get('/conquistas', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const [conquistas, pontos] = await Promise.all([
      prisma.conquista.findMany({ where: { userId: u.userId }, orderBy: { desbloqueadoEm: 'desc' } }),
      prisma.pontosUsuario.findUnique({ where: { userId: u.userId } })
    ]);
    return { conquistas, pontos: pontos?.total || 0, descontoLoja: Math.min(Math.floor((pontos?.total || 0) / 10), 30) };
  });

  fastify.get('/pontos', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const pontos = await prisma.pontosUsuario.findUnique({ where: { userId: u.userId } });
    const total = pontos?.total || 0;
    return { total, descontoReais: Math.min(Math.floor(total / 10), 30) };
  });

  fastify.get('/assessorias/:assessoriaId/meu-acesso', async (req, reply) => {
    const u = getUser(req);
    if (!u) return { acesso: false, motivo: 'login' };
    const assessoria = await prisma.assessoria.findUnique({
      where: { id: req.params.assessoriaId },
      select: { id: true, nome: true, comunidadeId: true }
    });
    if (!assessoria?.comunidadeId) return { acesso: true };
    const membro = await prisma.membroComunidade.findUnique({
      where: { userId_comunidadeId: { userId: u.userId, comunidadeId: assessoria.comunidadeId } }
    });
    if (membro?.status === 'ativo') return { acesso: true };
    const comunidade = await prisma.comunidade.findUnique({ where: { id: assessoria.comunidadeId }, select: { slug: true, nome: true } });
    return { acesso: false, motivo: 'nao_membro', mensagem: `Camiseta exclusiva para membros do grupo ${assessoria.nome}. Entre no grupo para comprar!`, grupoSlug: comunidade?.slug, grupoNome: comunidade?.nome };
  });
}
