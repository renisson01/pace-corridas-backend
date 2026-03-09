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

  // DASHBOARD DO TREINADOR
  fastify.get('/coach/dashboard', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const grupos = await prisma.comunidade.findMany({
      where: { criadorId: u.userId },
      include: {
        _count: { select: { membros: true, treinos: true } },
        treinos: { where: { ativo: true }, select: { id:true, titulo:true, diaSemana:true, horario:true } }
      }
    });
    const totalAlunos = grupos.reduce((s, g) => s + g._count.membros, 0);
    return {
      totalAlunos,
      totalGrupos: grupos.length,
      mensalidade: Math.round(totalAlunos * 23.94 * 100) / 100,
      grupos: grupos.map(g => ({
        id: g.id, nome: g.nome, slug: g.slug,
        membros: g._count.membros, treinos: g._count.treinos,
        proximosTreinos: g.treinos
      }))
    };
  });

  // LISTAR ALUNOS
  fastify.get('/coach/alunos', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const membros = await prisma.membroComunidade.findMany({
      where: { comunidade: { criadorId: u.userId } },
      include: {
        user: { select: { id:true, name:true, email:true, gender:true, city:true, state:true } },
        comunidade: { select: { id:true, nome:true } }
      }
    });
    return membros.map(m => ({
      id: m.user.id, nome: m.user.name, email: m.user.email,
      genero: m.user.gender, cidade: m.user.city, estado: m.user.state,
      grupo: m.comunidade.nome, grupoId: m.comunidade.id,
      role: m.role, membroId: m.id
    }));
  });

  // CRIAR TREINO NO GRUPO (CORRIGIDO: antes criava sem comunidadeId)
  fastify.post('/coach/treinos', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { titulo, descricao, diaSemana, horario, local, comunidadeId, recorrente, periodo } = req.body || {};
    if (!comunidadeId) return reply.code(400).send({ error: 'comunidadeId obrigatório' });
    if (!titulo)       return reply.code(400).send({ error: 'titulo obrigatório' });
    if (!horario)      return reply.code(400).send({ error: 'horario obrigatório (ex: 06:00)' });
    const grupo = await prisma.comunidade.findFirst({ where: { id: comunidadeId, criadorId: u.userId } });
    if (!grupo) return reply.code(403).send({ error: 'Grupo não encontrado ou sem permissão' });
    const treino = await prisma.treino.create({
      data: {
        comunidadeId, titulo,
        descricao: descricao || '',
        diaSemana: diaSemana || null,
        horario, local: local || null,
        recorrente: recorrente !== false,
        periodo: periodo || 'treino',
        ativo: true
      }
    });
    return { success: true, treino };
  });

  // LISTAR TREINOS DE UM GRUPO
  fastify.get('/coach/grupos/:grupoId/treinos', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const grupo = await prisma.comunidade.findFirst({ where: { id: req.params.grupoId, criadorId: u.userId } });
    if (!grupo) return reply.code(403).send({ error: 'Sem permissão' });
    const treinos = await prisma.treino.findMany({
      where: { comunidadeId: req.params.grupoId, ativo: true },
      orderBy: { createdAt: 'desc' }
    });
    return treinos;
  });

  // DELETAR TREINO
  fastify.delete('/coach/treinos/:id', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const treino = await prisma.treino.findFirst({ where: { id: req.params.id }, include: { comunidade: true } });
    if (!treino || treino.comunidade.criadorId !== u.userId) return reply.code(403).send({ error: 'Sem permissão' });
    await prisma.treino.update({ where: { id: req.params.id }, data: { ativo: false } });
    return { success: true };
  });

  // MURAL DO GRUPO
  fastify.post('/coach/mural', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { texto, tipo, comunidadeId } = req.body || {};
    if (!texto) return reply.code(400).send({ error: 'Texto obrigatório' });
    if (!comunidadeId) return reply.code(400).send({ error: 'comunidadeId obrigatório' });
    const grupo = await prisma.comunidade.findFirst({ where: { id: comunidadeId, criadorId: u.userId } });
    if (!grupo) return reply.code(403).send({ error: 'Sem permissão' });
    const msg = await prisma.mensagemComunidade.create({
      data: { conteudo: texto, tipo: tipo || 'aviso', autorId: u.userId, comunidadeId }
    });
    return { success: true, post: msg };
  });

  // MENSALIDADE
  fastify.get('/coach/mensalidade', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const grupos = await prisma.comunidade.findMany({
      where: { criadorId: u.userId },
      include: { _count: { select: { membros: true } } }
    });
    const total = grupos.reduce((s, g) => s + g._count.membros, 0);
    return {
      atletasAtivos: total,
      valorPorAtleta: 23.94,
      mensalidade: Math.round(total * 23.94 * 100) / 100,
      grupos: grupos.map(g => ({ nome: g.nome, membros: g._count.membros }))
    };
  });

  // TREINO DO DIA - ATLETA (CORRIGIDO: campo membroId correto no Checkin)
  fastify.get('/athlete/treino-hoje', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const dias = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
    const diaHoje = dias[new Date().getDay()];
    const membros = await prisma.membroComunidade.findMany({
      where: { userId: u.userId, status: 'ativo' },
      include: {
        comunidade: {
          include: {
            treinos: { where: { ativo: true, diaSemana: diaHoje } },
            criador: { select: { name: true } }
          }
        }
      }
    });
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const amanha = new Date(hoje); amanha.setDate(amanha.getDate()+1);
    const treinosHoje = [];
    for (const m of membros) {
      for (const t of m.comunidade.treinos) {
        const jaFez = await prisma.checkin.findFirst({
          where: { membroId: m.id, treinoId: t.id, data: { gte: hoje, lt: amanha } }
        }).catch(() => null);
        treinosHoje.push({
          id: t.id, titulo: t.titulo, descricao: t.descricao,
          horario: t.horario, local: t.local,
          grupo: m.comunidade.nome, treinador: m.comunidade.criador.name,
          membroId: m.id, jaFezCheckin: !!jaFez
        });
      }
    }
    return { dia: diaHoje, treinos: treinosHoje, totalGrupos: membros.length };
  });

  // CHECKIN DO ATLETA
  fastify.post('/athlete/checkin', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { treinoId, membroId } = req.body || {};
    if (!treinoId || !membroId) return reply.code(400).send({ error: 'treinoId e membroId obrigatórios' });
    const membro = await prisma.membroComunidade.findFirst({ where: { id: membroId, userId: u.userId } });
    if (!membro) return reply.code(403).send({ error: 'Sem permissão' });
    const checkin = await prisma.checkin.create({
      data: { membroId, treinoId, data: new Date(), tipo: 'treino' }
    });
    return { success: true, checkin };
  });

  // TODOS OS TREINOS DO ATLETA
  fastify.get('/athlete/meus-treinos', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const membros = await prisma.membroComunidade.findMany({
      where: { userId: u.userId },
      include: {
        comunidade: {
          include: {
            treinos: { where: { ativo: true }, orderBy: { createdAt: 'desc' } },
            criador: { select: { name: true } }
          }
        }
      }
    });
    return membros.map(m => ({
      grupo: m.comunidade.nome,
      treinador: m.comunidade.criador.name,
      treinos: m.comunidade.treinos
    }));
  });

}
