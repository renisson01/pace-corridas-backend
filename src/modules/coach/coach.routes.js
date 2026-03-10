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

  // ═══ COACH PERFIL ═══════════════════════════════════════════

  fastify.get('/coach/perfil', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const perfil = await prisma.coachProfile.findUnique({
      where: { userId: u.userId },
      include: { subscription: true }
    });
    if (!perfil) return reply.code(404).send({ error: 'Perfil não encontrado' });
    return { perfil };
  });

  fastify.post('/coach/ativar', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { bio, especialidade, instagram, whatsapp } = req.body || {};
    const existe = await prisma.coachProfile.findUnique({ where: { userId: u.userId } });
    if (existe) return { perfil: existe, jaExistia: true };
    const perfil = await prisma.coachProfile.create({
      data: { userId: u.userId, bio: bio||null, especialidade: especialidade||null, instagram: instagram||null, whatsapp: whatsapp||null, ativo: true }
    });
    await prisma.coachSubscription.create({
      data: { coachId: perfil.id, status: 'trial', athleteCount: 0, monthlyValue: 0 }
    });
    await prisma.user.update({ where: { id: u.userId }, data: { isCoach: true } });
    return { perfil, criado: true };
  });

  fastify.put('/coach/perfil', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { bio, especialidade, instagram, whatsapp, cidade, estado } = req.body || {};
    const perfil = await prisma.coachProfile.update({
      where: { userId: u.userId },
      data: { bio, especialidade, instagram, whatsapp, cidade, estado }
    });
    return { perfil };
  });

  // ═══ COACH DASHBOARD ════════════════════════════════════════

  fastify.get('/coach/dashboard', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const grupos = await prisma.comunidade.findMany({
      where: { criadorId: u.userId, ativa: true },
      include: { _count: { select: { membros: true, treinos: true } } }
    });
    const coachPerfil = await prisma.coachProfile.findUnique({
      where: { userId: u.userId },
      include: {
        atletas: {
          where: { status: 'ativo' },
          include: { atleta: { select: { id:true, name:true, city:true } } }
        },
        subscription: true
      }
    });
    const atletasGrupos = grupos.reduce((s,g) => s + g._count.membros, 0);
    const atletasDiretos = coachPerfil?.atletas?.length || 0;
    const totalAtletas = atletasGrupos + atletasDiretos;
    const comunidades = grupos.map(g => ({
      id:g.id, nome:g.nome, slug:g.slug, membros:g._count.membros, treinos:g._count.treinos
    }));
    return {
      totalAtletas, totalAlunos: totalAtletas,
      atletasGrupos, atletasDiretos,
      totalGrupos: grupos.length,
      mensalidade: Math.round(totalAtletas * 23.94 * 100) / 100,
      comunidades, grupos: comunidades,
      subscription: coachPerfil?.subscription || null,
      atletasVinculados: coachPerfil?.atletas?.map(a => a.atleta) || [],
      totalVinculados: atletasDiretos
    };
  });

  // ═══ COACH ALUNOS ═══════════════════════════════════════════

  fastify.get('/coach/alunos', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const membros = await prisma.membroComunidade.findMany({
      where: { comunidade: { criadorId: u.userId }, status: 'ativo' },
      include: {
        user: { select: { id:true,name:true,email:true,gender:true,city:true,state:true,tempo5k:true,fcMax:true } },
        comunidade: { select: { id:true, nome:true } }
      }
    });
    const coachPerfil = await prisma.coachProfile.findUnique({ where: { userId: u.userId } });
    let diretos = [];
    if (coachPerfil) {
      const ca = await prisma.coachAtleta.findMany({
        where: { coachId: coachPerfil.id, status: 'ativo' },
        include: { atleta: { select: { id:true,name:true,email:true,gender:true,city:true,state:true,tempo5k:true,fcMax:true } } }
      });
      diretos = ca.map(d => ({
        id:d.atleta.id, nome:d.atleta.name, email:d.atleta.email,
        genero:d.atleta.gender, cidade:d.atleta.city, estado:d.atleta.state,
        tempo5k:d.atleta.tempo5k, fcMax:d.atleta.fcMax,
        grupo:null, grupoId:null, role:'atleta', membroId:null, origem:'direto', coachAtletaId:d.id
      }));
    }
    const grupo = membros.map(m => ({
      id:m.user.id, nome:m.user.name, email:m.user.email,
      genero:m.user.gender, cidade:m.user.city, estado:m.user.state,
      tempo5k:m.user.tempo5k, fcMax:m.user.fcMax,
      grupo:m.comunidade.nome, grupoId:m.comunidade.id,
      role:m.role, membroId:m.id, origem:'grupo'
    }));
    const ids = new Set(grupo.map(a => a.id));
    return { atletas: [...grupo, ...diretos.filter(a => !ids.has(a.id))] };
  });

  fastify.post('/coach/atletas', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { email } = req.body || {};
    if (!email) return reply.code(400).send({ error: 'Email obrigatório' });
    const coachPerfil = await prisma.coachProfile.findUnique({ where: { userId: u.userId } });
    if (!coachPerfil) return reply.code(403).send({ error: 'Crie seu perfil de coach primeiro' });
    const atleta = await prisma.user.findUnique({ where: { email } });
    if (!atleta) return reply.code(404).send({ error: 'Usuário não encontrado' });
    const vinculo = await prisma.coachAtleta.upsert({
      where: { coachId_atletaId: { coachId: coachPerfil.id, atletaId: atleta.id } },
      update: { status: 'ativo' },
      create: { coachId: coachPerfil.id, atletaId: atleta.id }
    });
    return { success: true, vinculo, atleta: { id:atleta.id, nome:atleta.name, email:atleta.email } };
  });

  fastify.delete('/coach/atletas/:id', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const coachPerfil = await prisma.coachProfile.findUnique({ where: { userId: u.userId } });
    if (!coachPerfil) return reply.code(403).send({ error: 'Sem permissão' });
    await prisma.coachAtleta.updateMany({
      where: { coachId: coachPerfil.id, atletaId: req.params.id },
      data: { status: 'inativo' }
    });
    return { success: true };
  });

  // ═══ COACH TREINOS (com TreinoEtapa real) ══════════════════

  fastify.get('/coach/treinos', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const treinos = await prisma.treino.findMany({
      where: { comunidade: { criadorId: u.userId }, ativo: true },
      include: {
        comunidade: { select: { id:true, nome:true } },
        etapas: { orderBy: { ordem: 'asc' } },
        _count: { select: { checkins: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    return { treinos };
  });

  fastify.get('/coach/grupos/:grupoId/treinos', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const grupo = await prisma.comunidade.findFirst({ where: { id:req.params.grupoId, criadorId:u.userId } });
    if (!grupo) return reply.code(403).send({ error: 'Sem permissão' });
    const treinos = await prisma.treino.findMany({
      where: { comunidadeId: req.params.grupoId, ativo: true },
      include: { etapas: { orderBy: { ordem: 'asc' } } },
      orderBy: { createdAt: 'desc' }
    });
    return { treinos };
  });

  fastify.post('/coach/treinos', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { titulo, descricao, diaSemana, horario, local, comunidadeId, recorrente, periodo, etapas } = req.body || {};
    if (!comunidadeId) return reply.code(400).send({ error: 'comunidadeId obrigatório' });
    if (!titulo) return reply.code(400).send({ error: 'titulo obrigatório' });
    if (!horario) return reply.code(400).send({ error: 'horario obrigatório' });
    const grupo = await prisma.comunidade.findFirst({ where: { id:comunidadeId, criadorId:u.userId } });
    if (!grupo) return reply.code(403).send({ error: 'Sem permissão' });
    const treino = await prisma.treino.create({
      data: {
        comunidadeId, titulo,
        descricao: descricao || null,
        diaSemana: diaSemana != null && diaSemana !== '' ? String(diaSemana) : null,
        horario, local: local||null,
        recorrente: recorrente !== false,
        periodo: periodo||'treino', ativo: true
      }
    });
    if (etapas?.length) {
      await prisma.treinoEtapa.createMany({
        data: etapas.map((e,i) => ({
          treinoId: treino.id, ordem: i+1,
          tipo: e.tipo||'base', descricao: e.descricao||null,
          durMin: e.durMin ? parseInt(e.durMin) : null,
          distanciaM: e.distanciaM ? parseInt(e.distanciaM) : null,
          zona: e.zona||null,
          zonaFCmin: e.zonaFCmin ? parseFloat(e.zonaFCmin) : null,
          zonaFCmax: e.zonaFCmax ? parseFloat(e.zonaFCmax) : null,
          descRecup: e.descRecup||null,
          durRecupMin: e.durRecupMin ? parseInt(e.durRecupMin) : null,
          distRecupM: e.distRecupM ? parseInt(e.distRecupM) : null,
          repeticoes: e.repeticoes ? parseInt(e.repeticoes) : 1,
        }))
      });
    }
    const completo = await prisma.treino.findUnique({
      where: { id: treino.id },
      include: { etapas: { orderBy: { ordem: 'asc' } } }
    });
    return { success: true, treino: completo };
  });

  fastify.put('/coach/treinos/:id/etapas', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { etapas } = req.body || {};
    if (!etapas?.length) return reply.code(400).send({ error: 'etapas obrigatório' });
    const treino = await prisma.treino.findFirst({ where: { id:req.params.id, comunidade: { criadorId:u.userId } } });
    if (!treino) return reply.code(403).send({ error: 'Sem permissão' });
    await prisma.treinoEtapa.deleteMany({ where: { treinoId: treino.id } });
    await prisma.treinoEtapa.createMany({
      data: etapas.map((e,i) => ({
        treinoId: treino.id, ordem: i+1,
        tipo: e.tipo||'base', descricao: e.descricao||null,
        durMin: e.durMin ? parseInt(e.durMin) : null,
        distanciaM: e.distanciaM ? parseInt(e.distanciaM) : null,
        zona: e.zona||null,
        zonaFCmin: e.zonaFCmin ? parseFloat(e.zonaFCmin) : null,
        zonaFCmax: e.zonaFCmax ? parseFloat(e.zonaFCmax) : null,
        descRecup: e.descRecup||null,
        durRecupMin: e.durRecupMin ? parseInt(e.durRecupMin) : null,
        distRecupM: e.distRecupM ? parseInt(e.distRecupM) : null,
        repeticoes: e.repeticoes ? parseInt(e.repeticoes) : 1,
      }))
    });
    const atualizado = await prisma.treino.findUnique({
      where: { id: treino.id },
      include: { etapas: { orderBy: { ordem: 'asc' } } }
    });
    return { success: true, treino: atualizado };
  });

  fastify.delete('/coach/treinos/:id', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const treino = await prisma.treino.findFirst({ where: { id:req.params.id, comunidade: { criadorId:u.userId } } });
    if (!treino) return reply.code(403).send({ error: 'Sem permissão' });
    await prisma.treino.update({ where: { id: treino.id }, data: { ativo: false } });
    return { success: true };
  });

  // ═══ COACH MURAL ════════════════════════════════════════════

  fastify.get('/coach/mural', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const grupos = await prisma.comunidade.findMany({ where: { criadorId:u.userId }, select: { id:true } });
    const ids = grupos.map(g => g.id);
    if (!ids.length) return { posts: [] };
    const posts = await prisma.mensagemComunidade.findMany({
      where: { comunidadeId: { in:ids }, deletado: false },
      orderBy: { criadoEm: 'desc' }, take: 50,
      include: { autor: { select: { id:true, name:true } } }
    });
    return { posts };
  });

  fastify.post('/coach/mural', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { comunidadeId, conteudo, tipo } = req.body || {};
    if (!comunidadeId || !conteudo) return reply.code(400).send({ error: 'comunidadeId e conteudo obrigatórios' });
    const grupo = await prisma.comunidade.findFirst({ where: { id:comunidadeId, criadorId:u.userId } });
    if (!grupo) return reply.code(403).send({ error: 'Sem permissão' });
    const msg = await prisma.mensagemComunidade.create({
      data: { comunidadeId, autorId:u.userId, conteudo, tipo: tipo||'texto' }
    });
    return { success: true, post: msg };
  });

  // ═══ COACH FEEDBACKS ════════════════════════════════════════

  fastify.get('/coach/feedbacks', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const grupos = await prisma.comunidade.findMany({ where: { criadorId:u.userId }, select: { id:true } });
    const ids = grupos.map(g => g.id);
    if (!ids.length) return { feedbacks: [] };
    const feedbacks = await prisma.mensagemComunidade.findMany({
      where: { comunidadeId: { in:ids }, tipo:'feedback', deletado: false },
      orderBy: { criadoEm: 'desc' }, take: 50,
      include: { autor: { select: { id:true, name:true } } }
    });
    return { feedbacks };
  });

  // ═══ COACH MENSALIDADE ══════════════════════════════════════

  fastify.get('/coach/mensalidade', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const grupos = await prisma.comunidade.findMany({
      where: { criadorId:u.userId },
      include: { _count: { select: { membros:true } } }
    });
    const total = grupos.reduce((s,g) => s + g._count.membros, 0);
    return {
      atletasAtivos: total,
      valorPorAtleta: 23.94,
      mensalidade: Math.round(total * 23.94 * 100) / 100,
      grupos: grupos.map(g => ({ nome:g.nome, membros:g._count.membros }))
    };
  });

  // ═══ ATLETA TREINO DO DIA ════════════════════════════════════

  fastify.get('/athlete/treino-hoje', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const DIAS = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
    const diaHoje = DIAS[new Date().getDay()];
    const membros = await prisma.membroComunidade.findMany({
      where: { userId:u.userId, status:'ativo' },
      include: {
        comunidade: {
          include: {
            treinos: {
              where: { ativo:true, OR:[{ diaSemana:diaHoje },{ diaSemana:null, recorrente:true }] },
              include: { etapas: { orderBy: { ordem:'asc' } } }
            },
            criador: {
              select: {
                name:true,
                coachProfile: { select: { bio:true, especialidade:true, instagram:true, whatsapp:true } }
              }
            }
          }
        }
      }
    });
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const amanha = new Date(hoje); amanha.setDate(hoje.getDate()+1);
    const treinos = [];
    for (const m of membros) {
      for (const t of m.comunidade.treinos) {
        const jaFez = await prisma.checkin.findFirst({
          where: { membroId:m.id, treinoId:t.id, data:{ gte:hoje, lt:amanha } }
        }).catch(() => null);
        treinos.push({
          id:t.id, titulo:t.titulo, descricao:t.descricao,
          horario:t.horario, local:t.local, diaSemana:t.diaSemana,
          etapas: t.etapas,
          comunidade:{ nome:m.comunidade.nome, id:m.comunidade.id },
          treinador:m.comunidade.criador.name,
          coachProfile:m.comunidade.criador.coachProfile,
          membroId:m.id, jaFez:!!jaFez
        });
      }
    }
    return { dia:diaHoje, treinos, totalGrupos:membros.length };
  });

  // ═══ ATLETA CHECKIN ═════════════════════════════════════════

  fastify.post('/athlete/treino-concluido', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { treinoId } = req.body || {};
    if (!treinoId) return reply.code(400).send({ error: 'treinoId obrigatório' });
    const membro = await prisma.membroComunidade.findFirst({ where: { userId:u.userId, status:'ativo' } });
    if (!membro) return reply.code(403).send({ error: 'Você não está em nenhum grupo' });
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const amanha = new Date(hoje); amanha.setDate(hoje.getDate()+1);
    const jaFez = await prisma.checkin.findFirst({ where:{ membroId:membro.id, treinoId, data:{ gte:hoje, lt:amanha } } });
    if (jaFez) return { success:true, jaExistia:true, checkin:jaFez };
    const checkin = await prisma.checkin.create({
      data: { membroId:membro.id, treinoId, data:new Date(), tipo:'treino' }
    });
    await prisma.pontosUsuario.upsert({
      where: { userId:u.userId },
      update: { total:{ increment:10 }, checkins:{ increment:1 } },
      create: { userId:u.userId, total:10, checkins:1 }
    }).catch(() => {});
    return { success:true, checkin };
  });

  // ═══ ATLETA FEEDBACK ════════════════════════════════════════

  fastify.post('/athlete/feedback', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { feeling, comentario } = req.body || {};
    const membro = await prisma.membroComunidade.findFirst({
      where: { userId:u.userId, status:'ativo' },
      select: { comunidadeId:true }
    });
    if (!membro) return { success:false };
    const conteudo = feeling ? `${feeling}${comentario?' — '+comentario:''}` : (comentario||'');
    if (!conteudo) return reply.code(400).send({ error: 'Informe como se sentiu' });
    await prisma.mensagemComunidade.create({
      data: { comunidadeId:membro.comunidadeId, autorId:u.userId, conteudo, tipo:'feedback' }
    });
    return { success:true };
  });

  // ═══ ATLETA HISTÓRICO ════════════════════════════════════════

  fastify.get('/athlete/historico', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const membros = await prisma.membroComunidade.findMany({ where:{ userId:u.userId }, select:{ id:true } });
    const ids = membros.map(m => m.id);
    if (!ids.length) return { checkins:[] };
    const checkins = await prisma.checkin.findMany({
      where: { membroId:{ in:ids } },
      orderBy: { data:'desc' }, take:60,
      include: { treino: { select:{ titulo:true, comunidade:{ select:{ nome:true } } } } }
    });
    return { checkins };
  });

  // ═══ ATLETA MEU COACH ════════════════════════════════════════

  fastify.get('/athlete/meu-coach', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const membro = await prisma.membroComunidade.findFirst({
      where: { userId:u.userId, status:'ativo' },
      include: {
        comunidade: {
          include: {
            criador: {
              select: { id:true, name:true, phone:true, coachProfile:true }
            }
          }
        }
      }
    });
    if (membro) {
      const c = membro.comunidade.criador;
      const cp = c.coachProfile;
      return { coach:{ id:c.id, nome:c.name, bio:cp?.bio||null, especialidade:cp?.especialidade||null, instagram:cp?.instagram||null, whatsapp:cp?.whatsapp||c.phone||null, cidade:cp?.cidade||null, grupo:membro.comunidade.nome, grupoId:membro.comunidade.id } };
    }
    const ca = await prisma.coachAtleta.findFirst({
      where: { atletaId:u.userId, status:'ativo' },
      include: { coach: { include: { user:{ select:{ id:true, name:true, phone:true } } } } }
    });
    if (ca) {
      const cp = ca.coach;
      return { coach:{ id:cp.user.id, nome:cp.user.name, bio:cp.bio||null, especialidade:cp.especialidade||null, instagram:cp.instagram||null, whatsapp:cp.whatsapp||cp.user.phone||null, cidade:cp.cidade||null, grupo:null } };
    }
    return { coach:null };
  });

  // ═══ ATLETA PERFIL ═══════════════════════════════════════════

  fastify.get('/athlete/perfil', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const user = await prisma.user.findUnique({
      where: { id:u.userId },
      select: { fcMax:true, fcRepouso:true, tempo5k:true, tempo10k:true, tempo21k:true, tempo42k:true, nivelAtleta:true, name:true, city:true, gender:true }
    });
    return { perfil: user||{} };
  });

  fastify.patch('/athlete/perfil-fc', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { fcMax, fcRepouso } = req.body || {};
    const data = {};
    if (fcMax)     data.fcMax     = parseInt(fcMax);
    if (fcRepouso) data.fcRepouso = parseInt(fcRepouso);
    if (Object.keys(data).length) await prisma.user.update({ where:{ id:u.userId }, data }).catch(()=>{});
    return { success:true };
  });

  fastify.patch('/athlete/perfil-tempos', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { tempo5k, tempo10k, tempo21k, tempo42k } = req.body || {};
    const data = {};
    if (tempo5k)  data.tempo5k  = tempo5k;
    if (tempo10k) data.tempo10k = tempo10k;
    if (tempo21k) data.tempo21k = tempo21k;
    if (tempo42k) data.tempo42k = tempo42k;
    if (Object.keys(data).length) await prisma.user.update({ where:{ id:u.userId }, data }).catch(()=>{});
    return { success:true };
  });

  // ═══ ATLETA MURAL ════════════════════════════════════════════

  fastify.get('/athlete/mural', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const membro = await prisma.membroComunidade.findFirst({
      where: { userId:u.userId, status:'ativo' },
      select: { comunidadeId:true }
    });
    if (!membro) return { posts:[] };
    const posts = await prisma.mensagemComunidade.findMany({
      where: { comunidadeId:membro.comunidadeId, deletado:false },
      orderBy: { criadoEm:'desc' }, take:30,
      include: { autor: { select:{ name:true } } }
    });
    return { posts };
  });

  // ═══ ALIAS: /coach/atletas → /coach/alunos (compatibilidade HTML) ══════
  fastify.get('/coach/atletas', async (req, reply) => {
    const u = auth(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const membros = await prisma.membroComunidade.findMany({
      where: { comunidade: { criadorId: u.userId }, status: 'ativo' },
      include: {
        user: { select: { id:true,name:true,email:true,gender:true,city:true,state:true,tempo5k:true,fcMax:true } },
        comunidade: { select: { id:true, nome:true } }
      }
    });
    const coachPerfil = await prisma.coachProfile.findUnique({ where: { userId: u.userId } });
    let diretos = [];
    if (coachPerfil) {
      const ca = await prisma.coachAtleta.findMany({
        where: { coachId: coachPerfil.id, status: 'ativo' },
        include: { atleta: { select: { id:true,name:true,email:true,gender:true,city:true,state:true,tempo5k:true,fcMax:true } } }
      });
      diretos = ca.map(d => ({
        id:d.atleta.id, nome:d.atleta.name, email:d.atleta.email,
        genero:d.atleta.gender, cidade:d.atleta.city, estado:d.atleta.state,
        tempo5k:d.atleta.tempo5k, fcMax:d.atleta.fcMax,
        grupo:null, grupoId:null, role:'atleta', membroId:null, origem:'direto', coachAtletaId:d.id
      }));
    }
    const grupo = membros.map(m => ({
      id:m.user.id, nome:m.user.name, email:m.user.email,
      genero:m.user.gender, cidade:m.user.city, estado:m.user.state,
      tempo5k:m.user.tempo5k, fcMax:m.user.fcMax,
      grupo:m.comunidade.nome, grupoId:m.comunidade.id,
      role:m.role, membroId:m.id, origem:'grupo'
    }));
    const ids = new Set(grupo.map(a => a.id));
    return { atletas: [...grupo, ...diretos.filter(a => !ids.has(a.id))] };
  });


}
