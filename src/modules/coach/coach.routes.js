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
    const totalAtletas = grupos.reduce((s, g) => s + g._count.membros, 0);
    const comunidades  = grupos.map(g => ({
      id: g.id, nome: g.nome, slug: g.slug,
      membros: g._count.membros, treinos: g._count.treinos,
      proximosTreinos: g.treinos
    }));
    return {
      totalAtletas,
      totalAlunos: totalAtletas, // compatibilidade
      totalGrupos: grupos.length,
      mensalidade: Math.round(totalAtletas * 23.94 * 100) / 100,
      grupos: comunidades,
      comunidades  // treinador.html usa res.comunidades
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
    const atletas = membros.map(m => ({
      id: m.user.id, nome: m.user.name, email: m.user.email,
      genero: m.user.gender, cidade: m.user.city, estado: m.user.state,
      grupo: m.comunidade.nome, grupoId: m.comunidade.id,
      role: m.role, membroId: m.id
    }));
    return { atletas };
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
        diaSemana: diaSemana != null && diaSemana !== '' ? String(diaSemana) : null,
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

  // TREINO DO DIA - ATLETA
  fastify.get('/athlete/treino-hoje', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });

    // diaSemana salvo como String do número: '0'=Dom, '1'=Seg, ..., '6'=Sáb
    const diaHoje = String(new Date().getDay());

    const membros = await prisma.membroComunidade.findMany({
      where: { userId: u.userId, status: 'ativo' },
      include: {
        comunidade: {
          include: {
            // Buscar treinos do dia OU treinos sem dia específico (recorrente sem dia = sempre)
            treinos: {
              where: {
                ativo: true,
                OR: [
                  { diaSemana: diaHoje },
                  { diaSemana: null, recorrente: true }
                ]
              }
            },
            criador: { select: { name: true } }
          }
        }
      }
    });

    const hoje  = new Date(); hoje.setHours(0,0,0,0);
    const amanha = new Date(hoje); amanha.setDate(amanha.getDate()+1);
    const treinosHoje = [];

    for (const m of membros) {
      for (const t of m.comunidade.treinos) {
        const jaFez = await prisma.checkin.findFirst({
          where: { membroId: m.id, treinoId: t.id, data: { gte: hoje, lt: amanha } }
        }).catch(() => null);

        // Tentar parsear etapas do campo descricao se for JSON
        let etapas = [];
        if (t.descricao?.startsWith('[')) {
          try { etapas = JSON.parse(t.descricao); } catch {}
        }

        treinosHoje.push({
          id: t.id, titulo: t.titulo,
          descricao: etapas.length ? null : (t.descricao || null),
          etapas,
          horario: t.horario, local: t.local,
          diaSemana: t.diaSemana,
          comunidade: { nome: m.comunidade.nome },
          treinador: m.comunidade.criador.name,
          membroId: m.id,
          jaFez: !!jaFez
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

  // ─── GET MURAL ────────────────────────────────────────────────────────────
  fastify.get('/coach/mural', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const grupos = await prisma.comunidade.findMany({ where: { criadorId: u.userId }, select: { id: true } });
    const ids = grupos.map(g => g.id);
    const posts = await prisma.mensagemComunidade.findMany({
      where: { comunidadeId: { in: ids }, deletado: false },
      orderBy: { criadoEm: 'desc' },
      take: 50,
      include: { autor: { select: { name: true } }, comunidade: { select: { nome: true } } }
    });
    return { posts };
  });

  // ─── ETAPAS DO TREINO ─────────────────────────────────────────────────────
  // O schema não tem TreinoEtapa — salvamos como JSON na descricao do treino
  fastify.put('/coach/treinos/:id/etapas', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { etapas } = req.body || {};
    const treino = await prisma.treino.findFirst({
      where: { id: req.params.id }, include: { comunidade: true }
    });
    if (!treino || treino.comunidade.criadorId !== u.userId) return reply.code(403).send({ error: 'Sem permissão' });
    // Salvar etapas como JSON na descricao
    const descricao = JSON.stringify(etapas || []);
    await prisma.treino.update({ where: { id: req.params.id }, data: { descricao } });
    return { success: true };
  });

  // ─── FEEDBACKS DOS ALUNOS ─────────────────────────────────────────────────
  fastify.get('/coach/feedbacks', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const grupos = await prisma.comunidade.findMany({ where: { criadorId: u.userId }, select: { id: true } });
    const ids = grupos.map(g => g.id);
    // Feedbacks são mensagens do tipo 'feedback' dos alunos
    const feedbacks = await prisma.mensagemComunidade.findMany({
      where: { comunidadeId: { in: ids }, tipo: 'feedback', deletado: false },
      orderBy: { criadoEm: 'desc' },
      take: 50,
      include: { autor: { select: { name: true } } }
    });
    return { feedbacks };
  });

  // ─── TREINO CONCLUÍDO (ATLETA) ────────────────────────────────────────────
  fastify.post('/athlete/treino-concluido', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { treinoId } = req.body || {};
    if (!treinoId) return reply.code(400).send({ error: 'treinoId obrigatório' });
    // Buscar o membroId do atleta
    const membro = await prisma.membroComunidade.findFirst({
      where: { userId: u.userId, comunidade: { treinos: { some: { id: treinoId } } } }
    });
    if (!membro) return reply.code(403).send({ error: 'Treino não encontrado para este atleta' });
    const checkin = await prisma.checkin.create({
      data: { membroId: membro.id, treinoId, data: new Date(), tipo: 'treino' }
    }).catch(() => null);
    return { success: true, checkin };
  });

  // ─── FEEDBACK DO ATLETA ───────────────────────────────────────────────────
  fastify.post('/athlete/feedback', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { feeling, comentario } = req.body || {};
    if (!feeling) return reply.code(400).send({ error: 'feeling obrigatório' });
    // Postar no mural do grupo como feedback
    const membro = await prisma.membroComunidade.findFirst({
      where: { userId: u.userId }, include: { comunidade: true }
    });
    if (!membro) return reply.code(404).send({ error: 'Você não está em nenhum grupo' });
    const msg = await prisma.mensagemComunidade.create({
      data: {
        conteudo: `${feeling}${comentario ? ' — ' + comentario : ''}`,
        tipo: 'feedback',
        autorId: u.userId,
        comunidadeId: membro.comunidadeId
      }
    });
    return { success: true };
  });

  // ─── HISTÓRICO DO ATLETA ──────────────────────────────────────────────────
  fastify.get('/athlete/historico', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const membros = await prisma.membroComunidade.findMany({
      where: { userId: u.userId },
      select: { id: true }
    });
    const ids = membros.map(m => m.id);
    const checkins = await prisma.checkin.findMany({
      where: { membroId: { in: ids } },
      orderBy: { data: 'desc' },
      take: 50,
      include: {
        treino: { select: { titulo: true, comunidade: { select: { nome: true } } } }
      }
    });
    return { checkins };
  });

  // ─── MEU COACH (ATLETA) ───────────────────────────────────────────────────
  fastify.get('/athlete/meu-coach', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const membro = await prisma.membroComunidade.findFirst({
      where: { userId: u.userId },
      include: {
        comunidade: {
          include: { criador: { select: { id: true, name: true, bio: true, phone: true } } }
        }
      }
    });
    if (!membro) return { coach: null };
    const criador = membro.comunidade.criador;
    return {
      coach: {
        id: criador.id,
        nome: criador.name,
        bio: criador.bio,
        whatsapp: criador.phone,
        grupo: membro.comunidade.nome
      }
    };
  });

  // ─── PERFIL FC DO ATLETA ──────────────────────────────────────────────────
  fastify.patch('/athlete/perfil-fc', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { fcMax, fcRepouso } = req.body || {};
    // Salvar no localStorage do app (não temos campo no banco) — retornar ok
    // No futuro adicionar campo fcMax/fcRepouso no User
    return { success: true, fcMax, fcRepouso };
  });

  // ─── PERFIL TEMPOS DO ATLETA ──────────────────────────────────────────────
  fastify.patch('/athlete/perfil-tempos', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { tempo5k, tempo10k, tempo21k, tempo42k } = req.body || {};
    // Salvar como bio do usuário temporariamente (JSON)
    const tempos = JSON.stringify({ tempo5k, tempo10k, tempo21k, tempo42k });
    await prisma.user.update({ where: { id: u.userId }, data: { bio: tempos } }).catch(() => {});
    return { success: true };
  });

  // ─── MURAL DO ATLETA (ver posts do seu grupo) ────────────────────────────
  fastify.get('/athlete/mural', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const membro = await prisma.membroComunidade.findFirst({
      where: { userId: u.userId },
      select: { comunidadeId: true }
    });
    if (!membro) return { posts: [] };
    const posts = await prisma.mensagemComunidade.findMany({
      where: { comunidadeId: membro.comunidadeId, deletado: false },
      orderBy: { criadoEm: 'desc' },
      take: 30,
      include: { autor: { select: { name: true } } }
    });
    return { posts };
  });


}
