import prisma from '../../lib/prisma.js';
import jwt from 'jsonwebtoken';


function getUser(req) {
  try {
    const h = req.headers.authorization;
    if (!h) return null;
    return jwt.verify(h.replace('Bearer ', ''), process.env.JWT_SECRET || 'pace2026');
  } catch { return null; }
}

function slugify(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export async function comunidadeRoutes(fastify) {

  // ═══════════════════════════════════════════════════════
  // LISTAGEM PÚBLICA
  // ═══════════════════════════════════════════════════════

  // GET /grupos — listar todos os grupos públicos
  fastify.get('/grupos', async (req, reply) => {
    const { tipo, estado, cidade, busca, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    try {
      const where = { ativa: true };
      if (tipo) where.tipo = tipo;
      if (estado) where.estado = estado;
      if (cidade) where.cidade = { contains: cidade, mode: 'insensitive' };
      if (busca) where.OR = [
        { nome: { contains: busca, mode: 'insensitive' } },
        { descricao: { contains: busca, mode: 'insensitive' } },
      ];

      const [grupos, total] = await Promise.all([
        prisma.comunidade.findMany({
          where,
          include: {
            criador: { select: { id: true, name: true, photo: true } },
            _count: { select: { membros: true, mensagens: true } }
          },
          orderBy: { createdAt: 'desc' },
          skip, take: parseInt(limit)
        }),
        prisma.comunidade.count({ where })
      ]);

      return { grupos, total, paginas: Math.ceil(total / parseInt(limit)) };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // GET /grupos/:id — detalhe público do grupo
  fastify.get('/grupos/:id', async (req, reply) => {
    try {
      const grupo = await prisma.comunidade.findFirst({
        where: { OR: [{ id: req.params.id }, { slug: req.params.id }], ativa: true },
        include: {
          criador: { select: { id: true, name: true, photo: true, city: true, state: true } },
          membros: {
            where: { status: 'ativo' },
            include: { user: { select: { id: true, name: true, photo: true, tempo5k: true, nivelAtleta: true, city: true } } },
            orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
            take: 50
          },
          _count: { select: { membros: true, mensagens: true, treinos: true } }
        }
      });
      if (!grupo) return reply.code(404).send({ error: 'Grupo não encontrado' });
      return { grupo };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ═══════════════════════════════════════════════════════
  // CRIAR E EDITAR GRUPO (requer login)
  // ═══════════════════════════════════════════════════════

  // POST /grupos — criar novo grupo
  fastify.post('/grupos', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { nome, descricao, tipo = 'clube', cidade, estado, cor = '#00ff88',
      maxMembros, aprovacaoManual = false, fechado = false, generoRestrito, regras } = req.body || {};
    if (!nome) return reply.code(400).send({ error: 'Nome obrigatório' });

    let slug = slugify(nome);
    // garantir slug único
    const existing = await prisma.comunidade.findUnique({ where: { slug } }).catch(() => null);
    if (existing) slug = slug + '-' + Date.now().toString(36);

    try {
      const grupo = await prisma.comunidade.create({
        data: {
          nome, descricao: descricao || '', tipo, cidade: cidade || '', estado: estado || '',
          cor, maxMembros: maxMembros ? parseInt(maxMembros) : null,
          aprovacaoManual, fechado, generoRestrito: generoRestrito || null,
          criadorId: u.userId, slug, local: cidade && estado ? `${cidade}/${estado}` : '',
        }
      });

      // Admin entra automaticamente como admin
      await prisma.membroComunidade.create({
        data: { userId: u.userId, comunidadeId: grupo.id, role: 'admin', status: 'ativo' }
      });

      // Mensagem de boas-vindas automática do sistema
      await prisma.mensagemComunidade.create({
        data: {
          comunidadeId: grupo.id, autorId: u.userId,
          conteudo: `🎉 ${nome} foi criado! Bem-vindo ao grupo. Configure as regras e convide seus membros.`,
          tipo: 'sistema'
        }
      }).catch(() => {});

      return { success: true, grupo };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // PATCH /grupos/:id — editar grupo (apenas admin)
  fastify.patch('/grupos/:id', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const membro = await prisma.membroComunidade.findUnique({
        where: { userId_comunidadeId: { userId: u.userId, comunidadeId: req.params.id } }
      });
      if (!membro || !['admin', 'moderador'].includes(membro.role))
        return reply.code(403).send({ error: 'Apenas admins podem editar' });

      const { nome, descricao, tipo, cidade, estado, cor, maxMembros,
        aprovacaoManual, fechado, generoRestrito, regras, icone, banner } = req.body || {};

      const grupo = await prisma.comunidade.update({
        where: { id: req.params.id },
        data: {
          ...(nome && { nome }),
          ...(descricao !== undefined && { descricao }),
          ...(tipo && { tipo }),
          ...(cidade !== undefined && { cidade }),
          ...(estado !== undefined && { estado }),
          ...(cor && { cor }),
          ...(maxMembros !== undefined && { maxMembros: maxMembros ? parseInt(maxMembros) : null }),
          ...(aprovacaoManual !== undefined && { aprovacaoManual }),
          ...(fechado !== undefined && { fechado }),
          ...(generoRestrito !== undefined && { generoRestrito }),
          ...(icone !== undefined && { icone }),
          ...(banner !== undefined && { banner }),
        }
      });
      return { success: true, grupo };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // DELETE /grupos/:id — encerrar grupo (apenas criador)
  fastify.delete('/grupos/:id', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const grupo = await prisma.comunidade.findUnique({ where: { id: req.params.id } });
      if (!grupo) return reply.code(404).send({ error: 'Grupo não encontrado' });
      if (grupo.criadorId !== u.userId) return reply.code(403).send({ error: 'Apenas o criador pode encerrar o grupo' });

      await prisma.comunidade.update({ where: { id: req.params.id }, data: { ativa: false } });
      return { success: true };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ═══════════════════════════════════════════════════════
  // MEMBROS
  // ═══════════════════════════════════════════════════════

  // POST /grupos/:id/entrar — entrar no grupo
  fastify.post('/grupos/:id/entrar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { mensagemEntrada } = req.body || {};
    try {
      const grupo = await prisma.comunidade.findUnique({ where: { id: req.params.id } });
      if (!grupo || !grupo.ativa) return reply.code(404).send({ error: 'Grupo não encontrado' });

      // Verificar se já é membro
      const existing = await prisma.membroComunidade.findUnique({
        where: { userId_comunidadeId: { userId: u.userId, comunidadeId: req.params.id } }
      });
      if (existing) {
        if (existing.status === 'ativo') return reply.code(400).send({ error: 'Você já é membro' });
        if (existing.status === 'pendente') return reply.code(400).send({ error: 'Sua entrada está pendente de aprovação' });
        if (existing.status === 'banido') return reply.code(403).send({ error: 'Você foi removido deste grupo' });
        // Reativar
        await prisma.membroComunidade.update({
          where: { userId_comunidadeId: { userId: u.userId, comunidadeId: req.params.id } },
          data: { status: grupo.aprovacaoManual ? 'pendente' : 'ativo' }
        });
        return { success: true, status: grupo.aprovacaoManual ? 'pendente' : 'ativo' };
      }

      // Verificar limite de membros
      if (grupo.maxMembros) {
        const count = await prisma.membroComunidade.count({ where: { comunidadeId: grupo.id, status: 'ativo' } });
        if (count >= grupo.maxMembros) return reply.code(400).send({ error: 'Grupo cheio' });
      }

      const status = grupo.aprovacaoManual ? 'pendente' : 'ativo';
      await prisma.membroComunidade.create({
        data: { userId: u.userId, comunidadeId: req.params.id, role: 'membro', status, mensagemEntrada: mensagemEntrada || '' }
      });

      // Mensagem no chat se aprovação automática
      if (!grupo.aprovacaoManual) {
        const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { name: true } });
        await prisma.mensagemComunidade.create({
          data: { comunidadeId: req.params.id, autorId: u.userId, conteudo: `👋 ${user?.name} entrou no grupo!`, tipo: 'sistema' }
        }).catch(() => {});
      }

      return { success: true, status };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // POST /grupos/:id/sair — sair do grupo
  fastify.post('/grupos/:id/sair', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const grupo = await prisma.comunidade.findUnique({ where: { id: req.params.id } });
      if (grupo?.criadorId === u.userId) return reply.code(400).send({ error: 'O criador não pode sair. Transfira a administração ou encerre o grupo.' });

      await prisma.membroComunidade.update({
        where: { userId_comunidadeId: { userId: u.userId, comunidadeId: req.params.id } },
        data: { status: 'inativo' }
      });
      return { success: true };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // GET /grupos/:id/membros — listar membros (paginado)
  fastify.get('/grupos/:id/membros', async (req, reply) => {
    const { page = 1, status = 'ativo' } = req.query;
    try {
      const membros = await prisma.membroComunidade.findMany({
        where: { comunidadeId: req.params.id, status },
        include: { user: { select: { id: true, name: true, photo: true, tempo5k: true, nivelAtleta: true, city: true, state: true } } },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        skip: (parseInt(page) - 1) * 50, take: 50
      });
      return { membros };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ── ADMIN: gerenciar membros ──

  // PATCH /grupos/:id/membros/:userId — promover/rebaixar/banir
  fastify.patch('/grupos/:id/membros/:userId', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { role, status, apelido } = req.body || {};
    try {
      const adminMembro = await prisma.membroComunidade.findUnique({
        where: { userId_comunidadeId: { userId: u.userId, comunidadeId: req.params.id } }
      });
      if (!adminMembro || !['admin', 'moderador'].includes(adminMembro.role))
        return reply.code(403).send({ error: 'Sem permissão' });

      // Admin não pode rebaixar outro admin (só criador pode)
      if (role && role !== 'admin') {
        const grupo = await prisma.comunidade.findUnique({ where: { id: req.params.id } });
        const alvoMembro = await prisma.membroComunidade.findUnique({
          where: { userId_comunidadeId: { userId: req.params.userId, comunidadeId: req.params.id } }
        });
        if (alvoMembro?.role === 'admin' && grupo?.criadorId !== u.userId)
          return reply.code(403).send({ error: 'Apenas o criador pode alterar admins' });
      }

      const updated = await prisma.membroComunidade.update({
        where: { userId_comunidadeId: { userId: req.params.userId, comunidadeId: req.params.id } },
        data: { ...(role && { role }), ...(status && { status }), ...(apelido !== undefined && { apelido }) }
      });

      // Avisar no chat se banido
      if (status === 'banido') {
        await prisma.mensagemComunidade.create({
          data: { comunidadeId: req.params.id, autorId: u.userId, conteudo: `🚫 Um membro foi removido do grupo.`, tipo: 'sistema' }
        }).catch(() => {});
      }
      if (role === 'moderador') {
        await prisma.mensagemComunidade.create({
          data: { comunidadeId: req.params.id, autorId: u.userId, conteudo: `⭐ Um membro foi promovido a moderador.`, tipo: 'sistema' }
        }).catch(() => {});
      }

      return { success: true, membro: updated };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // POST /grupos/:id/aprovar/:userId — aprovar entrada pendente
  fastify.post('/grupos/:id/aprovar/:userId', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const adminMembro = await prisma.membroComunidade.findUnique({
        where: { userId_comunidadeId: { userId: u.userId, comunidadeId: req.params.id } }
      });
      if (!adminMembro || !['admin', 'moderador'].includes(adminMembro.role))
        return reply.code(403).send({ error: 'Sem permissão' });

      await prisma.membroComunidade.update({
        where: { userId_comunidadeId: { userId: req.params.userId, comunidadeId: req.params.id } },
        data: { status: 'ativo' }
      });
      const novoMembro = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { name: true } });
      await prisma.mensagemComunidade.create({
        data: { comunidadeId: req.params.id, autorId: u.userId, conteudo: `✅ ${novoMembro?.name} foi aprovado e entrou no grupo!`, tipo: 'sistema' }
      }).catch(() => {});
      return { success: true };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ═══════════════════════════════════════════════════════
  // CHAT DO GRUPO (tipo WhatsApp)
  // ═══════════════════════════════════════════════════════

  // GET /grupos/:id/chat — carregar mensagens (paginado, mais recentes primeiro)
  fastify.get('/grupos/:id/chat', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { before, limit = 50 } = req.query;
    try {
      // Verificar se é membro ativo
      const membro = await prisma.membroComunidade.findUnique({
        where: { userId_comunidadeId: { userId: u.userId, comunidadeId: req.params.id } }
      });
      if (!membro || membro.status !== 'ativo') return reply.code(403).send({ error: 'Você não é membro ativo deste grupo' });

      const where = { comunidadeId: req.params.id, deletado: false };
      if (before) where.criadoEm = { lt: new Date(before) };

      const msgs = await prisma.mensagemComunidade.findMany({
        where,
        include: { autor: { select: { id: true, name: true, photo: true } } },
        orderBy: { criadoEm: 'desc' },
        take: parseInt(limit)
      });

      return { mensagens: msgs.reverse(), meuRole: membro.role };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // POST /grupos/:id/chat — enviar mensagem
  fastify.post('/grupos/:id/chat', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { conteudo, tipo = 'texto', midiaUrl } = req.body || {};
    if (!conteudo?.trim()) return reply.code(400).send({ error: 'Mensagem não pode ser vazia' });
    try {
      // Verificar membro ativo
      const membro = await prisma.membroComunidade.findUnique({
        where: { userId_comunidadeId: { userId: u.userId, comunidadeId: req.params.id } }
      });
      if (!membro || membro.status !== 'ativo') return reply.code(403).send({ error: 'Você não é membro ativo' });

      const grupo = await prisma.comunidade.findUnique({ where: { id: req.params.id } });
      if (!grupo?.ativa) return reply.code(404).send({ error: 'Grupo não encontrado' });

      const msg = await prisma.mensagemComunidade.create({
        data: { comunidadeId: req.params.id, autorId: u.userId, conteudo: conteudo.trim(), tipo, midiaUrl: midiaUrl || null },
        include: { autor: { select: { id: true, name: true, photo: true } } }
      });
      return { success: true, mensagem: msg };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // DELETE /grupos/:id/chat/:msgId — deletar mensagem (própria ou admin)
  fastify.delete('/grupos/:id/chat/:msgId', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const msg = await prisma.mensagemComunidade.findUnique({ where: { id: req.params.msgId } });
      if (!msg) return reply.code(404).send({ error: 'Mensagem não encontrada' });

      const membro = await prisma.membroComunidade.findUnique({
        where: { userId_comunidadeId: { userId: u.userId, comunidadeId: req.params.id } }
      });
      const isAdmin = membro && ['admin', 'moderador'].includes(membro.role);
      const isAutor = msg.autorId === u.userId;
      if (!isAdmin && !isAutor) return reply.code(403).send({ error: 'Sem permissão' });

      await prisma.mensagemComunidade.update({ where: { id: req.params.msgId }, data: { deletado: true } });
      return { success: true };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ═══════════════════════════════════════════════════════
  // MEUS GRUPOS
  // ═══════════════════════════════════════════════════════

  // GET /grupos/meus — grupos do usuário logado
  fastify.get('/grupos/meus', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const membros = await prisma.membroComunidade.findMany({
        where: { userId: u.userId, status: 'ativo' },
        include: {
          comunidade: {
            include: {
              _count: { select: { membros: true, mensagens: true } },
              criador: { select: { id: true, name: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      const grupos = membros.map(m => ({
        ...m.comunidade,
        meuRole: m.role,
        entrei: m.createdAt,
        apelido: m.apelido
      }));

      return { grupos };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // GET /grupos/:id/pendentes — solicitações pendentes (admin)
  fastify.get('/grupos/:id/pendentes', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const adminMembro = await prisma.membroComunidade.findUnique({
        where: { userId_comunidadeId: { userId: u.userId, comunidadeId: req.params.id } }
      });
      if (!adminMembro || !['admin', 'moderador'].includes(adminMembro.role))
        return reply.code(403).send({ error: 'Sem permissão' });

      const pendentes = await prisma.membroComunidade.findMany({
        where: { comunidadeId: req.params.id, status: 'pendente' },
        include: { user: { select: { id: true, name: true, photo: true, tempo5k: true, city: true, state: true } } },
        orderBy: { createdAt: 'asc' }
      });
      return { pendentes };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ═══════════════════════════════════════════════════════
  // RANKING INTERNO DO GRUPO
  // ═══════════════════════════════════════════════════════
  fastify.get('/grupos/:id/ranking', async (req, reply) => {
    try {
      const membros = await prisma.membroComunidade.findMany({
        where: { comunidadeId: req.params.id, status: 'ativo' },
        include: { user: { select: { id: true, name: true, photo: true, tempo5k: true, tempo10k: true, tempo21k: true, nivelAtleta: true } } },
        orderBy: { createdAt: 'asc' }
      });

      const ranking = membros
        .filter(m => m.user.tempo5k)
        .map(m => {
          const [min, seg] = m.user.tempo5k.split(':').map(Number);
          return { ...m.user, role: m.role, apelido: m.apelido, tempo5kSeg: min * 60 + (seg || 0) };
        })
        .sort((a, b) => a.tempo5kSeg - b.tempo5kSeg);

      return { ranking };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });
}
