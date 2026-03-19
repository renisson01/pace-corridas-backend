import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
const prisma = new PrismaClient();
const JWT = process.env.JWT_SECRET || 'pace-secret-2026';
const getUser = (req) => { try { return jwt.verify(req.headers.authorization?.replace('Bearer ',''), JWT); } catch { return null; } };

// ─── Fórmula de Riegel: prever tempo em outra distância ───
function riegel(tempoSeg, distBase, distAlvo) {
  return tempoSeg * Math.pow(distAlvo / distBase, 1.06);
}

// ─── Pace em seg → "M:SS" ───
function fmtPace(seg) {
  if (!seg || seg <= 0) return '--';
  return `${Math.floor(seg/60)}:${String(Math.round(seg%60)).padStart(2,'0')}`;
}

// ─── Calcular paces completos a partir do tempo 5km ───
function calcularPacesCompleto(tempo5k) {
  const [m, s] = tempo5k.split(':').map(Number);
  const total = m * 60 + (s || 0);
  const pb = total / 5; // pace base (seg/km) no 5km
  return {
    // Paces de treino (por zona)
    trote:   fmtPace(pb * 1.55),  // Z1 — regenerativo
    ccl:     fmtPace(pb * 1.28),  // Z2 — base aeróbica longa
    ccm:     fmtPace(pb * 1.12),  // Z3 — limiar aeróbico
    ccr:     fmtPace(pb * 1.00),  // Z4 — limiar anaeróbico (ritmo de corrida)
    vo2:     fmtPace(pb * 0.90),  // Z5 — VO2max
    sprint:  fmtPace(pb * 0.80),  // Tiros curtos
    // Previsões de prova (Fórmula de Riegel)
    prev3k:  fmtPace(riegel(total, 5, 3) / 3),
    prev10k: fmtPace(riegel(total, 5, 10) / 10),
    prev21k: fmtPace(riegel(total, 5, 21.097) / 21.097),
    prev42k: fmtPace(riegel(total, 5, 42.195) / 42.195),
    // Tempos de prova
    tempo3k:  fmtPace(riegel(total, 5, 3)),
    tempo10k: fmtPace(riegel(total, 5, 10)),
    tempo21k: fmtPace(riegel(total, 5, 21.097)),
    tempo42k: fmtPace(riegel(total, 5, 42.195)),
    // Velocidades (km/h)
    velTrote: (3600 / (pb * 1.55)).toFixed(1),
    velCCL:   (3600 / (pb * 1.28)).toFixed(1),
    velCCM:   (3600 / (pb * 1.12)).toFixed(1),
    velCCR:   (3600 / (pb * 1.00)).toFixed(1),
    velVO2:   (3600 / (pb * 0.90)).toFixed(1),
  };
}

// ─── Calcular zonas FC (Karvonen) ───
function calcularZonasFC(fcMax, fcRepouso) {
  const fr = fcRepouso || Math.round(fcMax * 0.35);
  const res = fcMax - fr;
  const z = (a, b) => ({
    min: Math.round(fr + res * a),
    max: Math.round(fr + res * b),
    pct: `${Math.round(a*100)}-${Math.round(b*100)}%`
  });
  return {
    Z1: { nome: 'Trote / Regenerativo', ...z(.50, .64) },
    Z2: { nome: 'CCL — Base Aeróbica', ...z(.65, .75) },
    Z3: { nome: 'CCM — Limiar Aeróbico', ...z(.76, .84) },
    Z4: { nome: 'CCR — Limiar Anaeróbico', ...z(.85, 1.00) },
    Z5: { nome: 'VO2max / Sprint', ...z(1.01, 1.10) },
  };
}

export async function coachRoutes(fastify) {

  // ══════════════════════════════════════════════════════
  // PERFIL DO TREINADOR
  // ══════════════════════════════════════════════════════

  fastify.get('/coach/perfil', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      let perfil = await prisma.coachProfile.findUnique({
        where: { userId: u.userId },
        include: { subscription: true }
      });
      if (!perfil) {
        const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { name: true, city: true, state: true } });
        perfil = await prisma.coachProfile.create({
          data: { userId: u.userId, cidade: user?.city, estado: user?.state }
        });
      }
      return perfil;
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  fastify.patch('/coach/perfil', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { bio, especialidade, instagram, whatsapp, cidade, estado } = req.body || {};
    try {
      const perfil = await prisma.coachProfile.upsert({
        where: { userId: u.userId },
        create: { userId: u.userId, bio, especialidade, instagram, whatsapp, cidade, estado },
        update: { bio, especialidade, instagram, whatsapp, cidade, estado }
      });
      return { success: true, perfil };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ══════════════════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════════════════

  fastify.get('/coach/dashboard', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const perfil = await prisma.coachProfile.findUnique({
        where: { userId: u.userId },
        include: { atletas: { where: { status: 'ativo' } } }
      }).catch(() => null);

      const totalAtletas = perfil?.atletas?.length || 0;
      const atletaIds = perfil?.atletas?.map(a => a.atletaId) || [];

      // Treinos desta semana
      const inicioSemana = new Date();
      inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
      inicioSemana.setHours(0,0,0,0);

      const treinosSemana = await prisma.treino.findMany({
        where: {
          dataEspecifica: { gte: inicioSemana },
          comunidade: { adminId: u.userId }
        },
        include: { confirmacoes: true },
        orderBy: { dataEspecifica: 'asc' }
      }).catch(() => []);

      // Volume por dia da semana (últimos 7 dias)
      const volumePorDia = [0,0,0,0,0,0,0];
      treinosSemana.forEach(t => {
        if (t.dataEspecifica) {
          const dia = new Date(t.dataEspecifica).getDay();
          volumePorDia[dia]++;
        }
      });

      // GPS dos atletas esta semana
      const gpsData = atletaIds.length ? await prisma.atividadeGPS.groupBy({
        by: ['userId'],
        where: { userId: { in: atletaIds }, iniciadoEm: { gte: inicioSemana } },
        _sum: { distanciaKm: true },
        _count: true
      }).catch(() => []) : [];

      const hoje = new Date().toISOString().split('T')[0];
      const treinosHoje = treinosSemana.filter(t => t.dataEspecifica?.toISOString().split('T')[0] === hoje);

      // Atletas recentes com último GPS
      const atletasRecentes = await prisma.user.findMany({
        where: { id: { in: atletaIds.slice(0,5) } },
        select: { id: true, name: true, city: true, state: true, nivelAtleta: true, tempo5k: true }
      }).catch(() => []);

      return {
        totalAtletas,
        totalTreinosSemana: treinosSemana.length,
        checkinsHoje: treinosHoje.reduce((acc, t) => acc + (t.confirmacoes?.length||0), 0),
        volumePorDia,
        treinosHoje: treinosHoje.slice(0,5).map(t => ({
          id: t.id, titulo: t.titulo, horario: t.horario, local: t.local,
          confirmacoes: t.confirmacoes?.length || 0
        })),
        atletasRecentes,
        gpsResumoPorAtleta: gpsData,
      };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ══════════════════════════════════════════════════════
  // ATLETAS DO TREINADOR
  // ══════════════════════════════════════════════════════

  fastify.get('/coach/atletas', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const perfil = await prisma.coachProfile.findUnique({
        where: { userId: u.userId },
        include: { atletas: { where: { status: 'ativo' }, include: { atleta: {
          select: { id: true, name: true, email: true, city: true, state: true,
            gender: true, age: true, tempo5k: true, tempo10k: true, tempo21k: true,
            tempo42k: true, fcMax: true, fcRepouso: true, nivelAtleta: true, photo: true }
        }}}
      }});

      if (!perfil) return { atletas: [], total: 0 };

      const atletas = perfil.atletas.map(ca => ({
        id: ca.atleta.id,
        nome: ca.atleta.name,
        email: ca.atleta.email,
        cidade: ca.atleta.city,
        estado: ca.atleta.state,
        genero: ca.atleta.gender,
        idade: ca.atleta.age,
        tempo5k: ca.atleta.tempo5k,
        tempo10k: ca.atleta.tempo10k,
        tempo21k: ca.atleta.tempo21k,
        tempo42k: ca.atleta.tempo42k,
        fcMax: ca.atleta.fcMax,
        fcRepouso: ca.atleta.fcRepouso,
        nivel: ca.atleta.nivelAtleta,
        foto: ca.atleta.photo,
        vinculadoEm: ca.createdAt,
      }));

      return { atletas, total: atletas.length };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

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
          nivelAtleta: true, isPremium: true, bio: true, createdAt: true
        }
      });
      if (!atleta) return reply.code(404).send({ error: 'Atleta não encontrado' });

      // Paces e zonas calculados
      const paces = atleta.tempo5k ? calcularPacesCompleto(atleta.tempo5k) : null;
      const zonas = atleta.fcMax ? calcularZonasFC(atleta.fcMax, atleta.fcRepouso) : null;

      // Últimas atividades GPS
      const gpsAtividades = await prisma.atividadeGPS.findMany({
        where: { userId: atleta.id },
        orderBy: { iniciadoEm: 'desc' },
        take: 10,
        select: { id: true, tipo: true, distanciaKm: true, duracaoSeg: true,
          paceMedio: true, velMedia: true, titulo: true, fonte: true,
          iniciadoEm: true, caloriasEst: true, elevacaoGanho: true }
      }).catch(() => []);

      // Stats GPS (últimos 30 dias)
      const mes = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const gpsStats = await prisma.atividadeGPS.aggregate({
        where: { userId: atleta.id, iniciadoEm: { gte: mes } },
        _sum: { distanciaKm: true, duracaoSeg: true, caloriasEst: true },
        _count: true, _avg: { paceMedio: true }
      }).catch(() => null);

      // Últimos resultados de provas
      const resultados = await prisma.result.findMany({
        where: { athleteId: atleta.athleteId || '' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, distance: true, time: true, pace: true, createdAt: true }
      }).catch(() => []);

      return { atleta, paces, zonas, gpsAtividades, gpsStats, resultados };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  fastify.post('/coach/atletas/convidar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { email, atletaId } = req.body || {};
    try {
      let perfil = await prisma.coachProfile.findUnique({ where: { userId: u.userId } });
      if (!perfil) perfil = await prisma.coachProfile.create({ data: { userId: u.userId } });

      const alvo = email
        ? await prisma.user.findUnique({ where: { email } })
        : atletaId ? await prisma.user.findUnique({ where: { id: atletaId } }) : null;

      if (!alvo) return reply.code(404).send({ error: 'Atleta não encontrado com este email' });

      await prisma.coachAtleta.upsert({
        where: { coachId_atletaId: { coachId: perfil.id, atletaId: alvo.id } },
        create: { coachId: perfil.id, atletaId: alvo.id, status: 'ativo' },
        update: { status: 'ativo' }
      });

      return { success: true, atleta: { id: alvo.id, nome: alvo.name, email: alvo.email } };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

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

  // ══════════════════════════════════════════════════════
  // TREINOS ESTRUTURADOS
  // ══════════════════════════════════════════════════════

  fastify.post('/coach/treinos', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { atletaId, titulo, descricao, tipo, metodologia, distanciaKm,
            dataEspecifica, horario, local, observacoes, etapas } = req.body || {};
    if (!titulo) return reply.code(400).send({ error: 'Título obrigatório' });
    try {
      let comunidade = await prisma.comunidade.findFirst({ where: { adminId: u.userId } }).catch(() => null);
      if (!comunidade) {
        comunidade = await prisma.comunidade.create({
          data: { nome: 'Equipe do Treinador', slug: `coach-${u.userId}-${Date.now()}`,
            descricao: 'Equipe do painel do treinador', adminId: u.userId,
            cidade: '', estado: '', tipo: 'privada' }
        }).catch(() => null);
      }
      if (!comunidade) return reply.code(500).send({ error: 'Erro ao criar estrutura' });

      const treino = await prisma.treino.create({
        data: {
          comunidadeId: comunidade.id,
          titulo,
          descricao: [descricao, metodologia ? `Metodologia: ${metodologia}` : '', observacoes].filter(Boolean).join('\n'),
          horario: horario || '06:00',
          local: local || '',
          periodo: tipo || metodologia || 'Contínuo',
          dataEspecifica: dataEspecifica ? new Date(dataEspecifica) : null,
          recorrente: false,
          etapas: etapas?.length ? {
            create: etapas.map((e, i) => ({
              ordem: i + 1,
              tipo: e.tipo || 'base',
              descricao: e.descricao || '',
              durMin: e.durMin ? parseInt(e.durMin) : null,
              distanciaM: e.distM ? parseInt(e.distM) * 1000 : e.distanciaM ? parseInt(e.distanciaM) : null,
              zona: e.zona || null,
              zonaFCmin: e.fcMin ? parseFloat(e.fcMin) : null,
              zonaFCmax: e.fcMax ? parseFloat(e.fcMax) : null,
              paceMin: e.paceMin || null,
              descRecup: e.recuperacao || null,
              durRecupMin: e.recuperacaoMin ? parseInt(e.recuperacaoMin) : null,
            }))
          } : undefined
        },
        include: { etapas: true }
      });

      // Vincular ao atleta se informado (para o painel do treinador saber de quem é)
      if (atletaId) {
        await prisma.treino.update({
          where: { id: treino.id },
          data: { descricao: (treino.descricao || '') + `\n[atletaId:${atletaId}]` }
        }).catch(() => {});
      }

      return { success: true, treino };
    } catch(e) { console.error(e); return reply.code(500).send({ error: e.message }); }
  });

  fastify.patch('/coach/treinos/:treinoId', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { titulo, descricao, tipo, horario, local, dataEspecifica, etapas } = req.body || {};
    try {
      const treino = await prisma.treino.update({
        where: { id: req.params.treinoId },
        data: {
          ...(titulo && { titulo }),
          ...(descricao && { descricao }),
          ...(tipo && { periodo: tipo }),
          ...(horario && { horario }),
          ...(local !== undefined && { local }),
          ...(dataEspecifica && { dataEspecifica: new Date(dataEspecifica) }),
        }
      });
      return { success: true, treino };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  fastify.get('/coach/treinos', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { atletaId } = req.query;
    try {
      const comunidades = await prisma.comunidade.findMany({
        where: { adminId: u.userId }, select: { id: true }
      }).catch(() => []);
      const ids = comunidades.map(c => c.id);
      if (!ids.length) return { treinos: [], total: 0 };

      const where = { comunidadeId: { in: ids } };
      if (atletaId) where.descricao = { contains: `[atletaId:${atletaId}]` };

      const treinos = await prisma.treino.findMany({
        where, orderBy: { dataEspecifica: 'desc' },
        include: { etapas: { orderBy: { ordem: 'asc' } }, confirmacoes: true }
      });
      return { treinos, total: treinos.length };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  fastify.get('/coach/treinos/:treinoId', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const treino = await prisma.treino.findUnique({
      where: { id: req.params.treinoId },
      include: { etapas: { orderBy: { ordem: 'asc' } }, confirmacoes: true }
    }).catch(() => null);
    if (!treino) return reply.code(404).send({ error: 'Treino não encontrado' });
    return treino;
  });

  fastify.delete('/coach/treinos/:treinoId', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      await prisma.treinoEtapa.deleteMany({ where: { treinoId: req.params.treinoId } });
      await prisma.treino.delete({ where: { id: req.params.treinoId } });
      return { success: true };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ══════════════════════════════════════════════════════
  // PLANILHA SEMANAL DO ATLETA
  // ══════════════════════════════════════════════════════

  fastify.get('/coach/planilha/:atletaId', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const { semana } = req.query; // semana = offset (0=atual, -1=anterior, 1=próxima)
      const offset = parseInt(semana) || 0;

      const atleta = await prisma.user.findUnique({
        where: { id: req.params.atletaId },
        select: { id: true, name: true, tempo5k: true, tempo10k: true, tempo21k: true,
          fcMax: true, fcRepouso: true, nivelAtleta: true, age: true, gender: true }
      });
      if (!atleta) return reply.code(404).send({ error: 'Atleta não encontrado' });

      const paces = atleta.tempo5k ? calcularPacesCompleto(atleta.tempo5k) : null;
      const zonas = atleta.fcMax ? calcularZonasFC(atleta.fcMax, atleta.fcRepouso) : null;

      // Calcular início da semana com offset
      const inicio = new Date();
      inicio.setDate(inicio.getDate() - inicio.getDay() + (offset * 7));
      inicio.setHours(0,0,0,0);
      const fim = new Date(inicio);
      fim.setDate(fim.getDate() + 7);

      // Buscar treinos do atleta nesta semana
      const comunidades = await prisma.comunidade.findMany({
        where: { adminId: u.userId }, select: { id: true }
      }).catch(() => []);
      const comIds = comunidades.map(c => c.id);

      const treinos = comIds.length ? await prisma.treino.findMany({
        where: {
          comunidadeId: { in: comIds },
          dataEspecifica: { gte: inicio, lt: fim },
          descricao: { contains: `atletaId:${atleta.id}` }
        },
        include: { etapas: { orderBy: { ordem: 'asc' } }, confirmacoes: true },
        orderBy: { dataEspecifica: 'asc' }
      }).catch(() => []) : [];

      // Atividades GPS desta semana (para comparar planejado vs executado)
      const gpsAtividades = await prisma.atividadeGPS.findMany({
        where: { userId: atleta.id, iniciadoEm: { gte: inicio, lt: fim } },
        orderBy: { iniciadoEm: 'asc' },
        select: { id: true, tipo: true, distanciaKm: true, duracaoSeg: true,
          paceMedio: true, titulo: true, fonte: true, iniciadoEm: true }
      }).catch(() => []);

      // Volume total planejado e executado
      const kmPlanejado = treinos.reduce((acc, t) => {
        return acc + (t.etapas?.reduce((s, e) => s + (e.distanciaM || 0) / 1000, 0) || 0);
      }, 0);
      const kmExecutado = gpsAtividades.reduce((acc, a) => acc + (a.distanciaKm || 0), 0);

      return {
        atleta, paces, zonas, treinos,
        gpsAtividades, semanaInicio: inicio.toISOString(),
        resumo: {
          kmPlanejado: parseFloat(kmPlanejado.toFixed(1)),
          kmExecutado: parseFloat(kmExecutado.toFixed(1)),
          totalTreinos: treinos.length,
          totalAtividades: gpsAtividades.length,
          aderencia: kmPlanejado > 0 ? Math.round((kmExecutado / kmPlanejado) * 100) : null
        }
      };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ══════════════════════════════════════════════════════
  // CALCULADORAS
  // ══════════════════════════════════════════════════════

  fastify.post('/coach/calcular-zonas', async (req, reply) => {
    const { fcMax, fcRepouso } = req.body || {};
    if (!fcMax) return reply.code(400).send({ error: 'FC Máxima obrigatória' });
    return { fcMax, fcRepouso: fcRepouso || Math.round(fcMax * 0.35), zonas: calcularZonasFC(fcMax, fcRepouso) };
  });

  fastify.post('/coach/calcular-paces', async (req, reply) => {
    const { tempo5k } = req.body || {};
    if (!tempo5k) return reply.code(400).send({ error: 'Tempo 5km obrigatório' });
    return { tempo5k, paces: calcularPacesCompleto(tempo5k) };
  });

  // ══════════════════════════════════════════════════════
  // METODOLOGIAS
  // ══════════════════════════════════════════════════════

  fastify.post('/coach/metodologia/gerar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { metodologia, atletaId, semanas, objetivo } = req.body || {};
    if (!metodologia || !atletaId) return reply.code(400).send({ error: 'Metodologia e atletaId obrigatórios' });

    const atleta = await prisma.user.findUnique({
      where: { id: atletaId },
      select: { name: true, tempo5k: true, fcMax: true, fcRepouso: true, nivelAtleta: true }
    }).catch(() => null);
    if (!atleta) return reply.code(404).send({ error: 'Atleta não encontrado' });

    const paces = atleta.tempo5k ? calcularPacesCompleto(atleta.tempo5k) : null;
    const zonas = atleta.fcMax ? calcularZonasFC(atleta.fcMax, atleta.fcRepouso) : null;

    const metodologias = {
      polarizado: {
        nome: 'Treino Polarizado (80/20)',
        descricao: 'Stephen Seiler — 80% volume em Z1-Z2, 20% em Z4-Z5',
        semanaModelo: [
          { dia: 'Segunda', tipo: 'CCL Base', zona: 'Z2', desc: `Contínuo leve 45-60min (${paces?.ccl||'--'}/km)`, descanso: false },
          { dia: 'Terça', tipo: 'Tiros', zona: 'Z5', desc: `6-8x 400m (${paces?.vo2||'--'}/km) | Rec: trote 2min`, descanso: false },
          { dia: 'Quarta', tipo: 'Regenerativo', zona: 'Z1', desc: `Trote leve 30min (${paces?.trote||'--'}/km)`, descanso: false },
          { dia: 'Quinta', tipo: 'Tempo Run', zona: 'Z4', desc: `20-25min no limiar (${paces?.ccr||'--'}/km)`, descanso: false },
          { dia: 'Sexta', tipo: 'Descanso', zona: '', desc: 'Descanso ativo ou caminhada', descanso: true },
          { dia: 'Sábado', tipo: 'Long Run', zona: 'Z2', desc: `Longa 1h-1h30 (${paces?.ccl||'--'}/km)`, descanso: false },
          { dia: 'Domingo', tipo: 'Descanso', zona: '', desc: 'Descanso total', descanso: true },
        ]
      },
      lydiard: {
        nome: 'Método Lydiard',
        descricao: 'Arthur Lydiard — Base aeróbica extensa, periodização em blocos',
        semanaModelo: [
          { dia: 'Segunda', tipo: 'Long Run', zona: 'Z2', desc: `Corrida base 60-90min (${paces?.ccl||'--'}/km)`, descanso: false },
          { dia: 'Terça', tipo: 'CCM', zona: 'Z3', desc: `Ritmo controlado 45min (${paces?.ccm||'--'}/km)`, descanso: false },
          { dia: 'Quarta', tipo: 'CCL', zona: 'Z2', desc: `Base aeróbica 50min (${paces?.ccl||'--'}/km)`, descanso: false },
          { dia: 'Quinta', tipo: 'Fartlek', zona: 'Z2-Z4', desc: `Fartlek 40min — variações espontâneas`, descanso: false },
          { dia: 'Sexta', tipo: 'Regenerativo', zona: 'Z1', desc: `Trote regenerativo 30min (${paces?.trote||'--'}/km)`, descanso: false },
          { dia: 'Sábado', tipo: 'Long Run', zona: 'Z2', desc: `Corrida longa 80-100min (${paces?.ccl||'--'}/km)`, descanso: false },
          { dia: 'Domingo', tipo: 'Descanso', zona: '', desc: 'Descanso total ou caminhada', descanso: true },
        ]
      },
      jackdaniels: {
        nome: 'Método Jack Daniels (VDOT)',
        descricao: 'Jack Daniels — Paces calculados pelo VDOT, 5 tipos de treino',
        semanaModelo: [
          { dia: 'Segunda', tipo: 'Easy (E)', zona: 'Z1-Z2', desc: `Easy Run 40-50min (${paces?.trote||'--'}/km)`, descanso: false },
          { dia: 'Terça', tipo: 'Intervalado (I)', zona: 'Z5', desc: `5x1000m (${paces?.vo2||'--'}/km) | Rec: 3min`, descanso: false },
          { dia: 'Quarta', tipo: 'Easy (E)', zona: 'Z1', desc: `Easy Run 30min (${paces?.trote||'--'}/km)`, descanso: false },
          { dia: 'Quinta', tipo: 'Tempo (T)', zona: 'Z4', desc: `Tempo Run 20min (${paces?.ccr||'--'}/km)`, descanso: false },
          { dia: 'Sexta', tipo: 'Easy (E)', zona: 'Z1', desc: `Easy Run 30min (${paces?.trote||'--'}/km)`, descanso: false },
          { dia: 'Sábado', tipo: 'Long Run (L)', zona: 'Z2', desc: `Long Run 70-90min (${paces?.ccl||'--'}/km)`, descanso: false },
          { dia: 'Domingo', tipo: 'Descanso', zona: '', desc: 'Descanso', descanso: true },
        ]
      },
      hiit: {
        nome: 'HIIT Corrida',
        descricao: 'Alta intensidade intervalada — melhora VO2max rapidamente',
        semanaModelo: [
          { dia: 'Segunda', tipo: 'HIIT', zona: 'Z5', desc: `8x 200m (${paces?.sprint||'--'}/km) | Rec: 90s`, descanso: false },
          { dia: 'Terça', tipo: 'Recuperação', zona: 'Z1', desc: `Trote leve 30min (${paces?.trote||'--'}/km)`, descanso: false },
          { dia: 'Quarta', tipo: 'HIIT Longo', zona: 'Z4-Z5', desc: `4x 1000m (${paces?.vo2||'--'}/km) | Rec: 3min`, descanso: false },
          { dia: 'Quinta', tipo: 'Descanso', zona: '', desc: 'Descanso ativo', descanso: true },
          { dia: 'Sexta', tipo: 'HIIT Pirâmide', zona: 'Z5', desc: `200-400-600-400-200m | Rec proporcional`, descanso: false },
          { dia: 'Sábado', tipo: 'Long Run', zona: 'Z2', desc: `Longa aeróbica 50-60min (${paces?.ccl||'--'}/km)`, descanso: false },
          { dia: 'Domingo', tipo: 'Descanso', zona: '', desc: 'Descanso total', descanso: true },
        ]
      },
      fartlek: {
        nome: 'Fartlek Estruturado',
        descricao: 'Variações de ritmo em corrida contínua — excelente para iniciantes/intermediários',
        semanaModelo: [
          { dia: 'Segunda', tipo: 'Fartlek', zona: 'Z2-Z4', desc: `40min: 5min CCL + 2min CCR alternando`, descanso: false },
          { dia: 'Terça', tipo: 'Regenerativo', zona: 'Z1', desc: `Trote 25min (${paces?.trote||'--'}/km)`, descanso: false },
          { dia: 'Quarta', tipo: 'Fartlek Longo', zona: 'Z2-Z4', desc: `50min com variações progressivas`, descanso: false },
          { dia: 'Quinta', tipo: 'CCL', zona: 'Z2', desc: `Base 35min (${paces?.ccl||'--'}/km)`, descanso: false },
          { dia: 'Sexta', tipo: 'Descanso', zona: '', desc: 'Descanso', descanso: true },
          { dia: 'Sábado', tipo: 'Fartlek Livre', zona: 'Z1-Z5', desc: `60min por percepção`, descanso: false },
          { dia: 'Domingo', tipo: 'Descanso', zona: '', desc: 'Descanso total', descanso: true },
        ]
      }
    };

    const modelo = metodologias[metodologia.toLowerCase()] || metodologias.polarizado;
    return { metodologia: modelo, atleta: { nome: atleta.name, paces, zonas }, disponíveis: Object.keys(metodologias) };
  });

  // ══════════════════════════════════════════════════════
  // LINK DE CONVITE
  // ══════════════════════════════════════════════════════

  fastify.get('/coach/link/:coachUserId', async (req, reply) => {
    const coach = await prisma.coachProfile.findUnique({
      where: { userId: req.params.coachUserId },
      include: { user: { select: { name: true, city: true, state: true } } }
    }).catch(() => null);
    if (!coach) return reply.code(404).send({ error: 'Treinador não encontrado' });
    return { coach: { nome: coach.user.name, especialidade: coach.especialidade, cidade: coach.cidade || coach.user.city, bio: coach.bio } };
  });

}
