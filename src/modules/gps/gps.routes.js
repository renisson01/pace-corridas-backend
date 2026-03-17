import prisma from '../lib/prisma.js';
import jwt from 'jsonwebtoken';

const JWT = process.env.JWT_SECRET || 'pace-secret-2026';

function getUser(req) {
  try { return jwt.verify(req.headers.authorization?.replace('Bearer ', ''), JWT); }
  catch { return null; }
}

function calcPace(distKm, duracaoSeg) {
  if (!distKm || distKm <= 0) return null;
  const paceSeconds = duracaoSeg / distKm;
  const min = Math.floor(paceSeconds / 60);
  const sec = Math.floor(paceSeconds % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function calcCalorias(distKm, pesoKg) {
  return Math.round(distKm * (pesoKg || 70) * 1.036);
}

export async function gpsRoutes(fastify) {

  // SALVAR ATIVIDADE GPS
  fastify.post('/gps/atividade', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const {
      tipo, distanciaKm, duracaoSeg, pontosRota, rotaJSON,
      inicioLat, inicioLng, fimLat, fimLng,
      clima, temperatura, titulo, nota, iniciadoEm, finalizadoEm,
      elevacaoGanho, compartilhado
    } = req.body || {};

    if (!distanciaKm || !duracaoSeg) return reply.code(400).send({ error: 'Distância e duração obrigatórios' });

    const paceStr = calcPace(distanciaKm, duracaoSeg);
    const velMedia = distanciaKm / (duracaoSeg / 3600); // km/h

    // Buscar peso do usuário pra calcular calorias
    const avatar = await prisma.atletaAvatar.findUnique({ where: { userId: u.userId } }).catch(() => null);
    const calorias = calcCalorias(distanciaKm, avatar?.peso);

    const atividade = await prisma.atividadeGPS.create({
      data: {
        userId: u.userId,
        tipo: tipo || 'corrida',
        distanciaKm: parseFloat(distanciaKm),
        duracaoSeg: parseInt(duracaoSeg),
        paceMedio: paceStr,
        velMedia: parseFloat(velMedia.toFixed(2)),
        caloriasEst: calorias,
        elevacaoGanho: elevacaoGanho ? parseFloat(elevacaoGanho) : null,
        rotaJSON: rotaJSON || null,
        pontosRota: pontosRota ? JSON.stringify(pontosRota) : null,
        inicioLat: inicioLat ? parseFloat(inicioLat) : null,
        inicioLng: inicioLng ? parseFloat(inicioLng) : null,
        fimLat: fimLat ? parseFloat(fimLat) : null,
        fimLng: fimLng ? parseFloat(fimLng) : null,
        clima: clima || null,
        temperatura: temperatura ? parseFloat(temperatura) : null,
        titulo: titulo || null,
        nota: nota || null,
        compartilhado: compartilhado || false,
        iniciadoEm: new Date(iniciadoEm || Date.now()),
        finalizadoEm: new Date(finalizadoEm || Date.now()),
      }
    });

    // Dar pontos por atividade
    const pontosGanhos = Math.floor(distanciaKm * 10); // 10 pts por km
    await prisma.pontosUsuario.upsert({
      where: { userId: u.userId },
      create: { userId: u.userId, total: pontosGanhos },
      update: { total: { increment: pontosGanhos } }
    });

    // Verificar conquistas de distância
    const totalKm = await prisma.atividadeGPS.aggregate({
      where: { userId: u.userId },
      _sum: { distanciaKm: true }
    });
    const kmTotal = totalKm._sum.distanciaKm || 0;

    const conquistasDistancia = [
      { km: 10, tipo: 'km_10', titulo: '🏃 Primeiros 10km', desc: 'Acumulou 10km no GPS' },
      { km: 50, tipo: 'km_50', titulo: '🔥 50km acumulados', desc: 'Meio centenário!' },
      { km: 100, tipo: 'km_100', titulo: '💯 Centenário', desc: '100km percorridos. Libera camiseta Level 100!' },
      { km: 500, tipo: 'km_500', titulo: '🚀 Ultra Runner', desc: '500km no PACE BR!' },
      { km: 1000, tipo: 'km_1000', titulo: '🌟 Lenda Absoluta', desc: '1.000km! Você é imbatível.' },
    ];

    const novasConquistas = [];
    for (const c of conquistasDistancia) {
      if (kmTotal >= c.km) {
        const [conquista, created] = await prisma.$transaction([
          prisma.conquista.upsert({
            where: { userId_tipo: { userId: u.userId, tipo: c.tipo } },
            create: { userId: u.userId, tipo: c.tipo, titulo: c.titulo, descricao: c.desc, icone: '🏅', pontosGanhos: c.km },
            update: {}
          }),
        ]);
        // Check if it's new (simplified)
      }
    }

    return {
      success: true,
      atividade: {
        id: atividade.id,
        distanciaKm: atividade.distanciaKm,
        duracaoSeg: atividade.duracaoSeg,
        paceMedio: paceStr,
        velMedia: atividade.velMedia,
        calorias,
        pontosGanhos
      },
      kmTotal: parseFloat(kmTotal.toFixed(2)),
    };
  });

  // LISTAR MINHAS ATIVIDADES
  fastify.get('/gps/atividades', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { limit, offset } = req.query;
    const atividades = await prisma.atividadeGPS.findMany({
      where: { userId: u.userId },
      orderBy: { iniciadoEm: 'desc' },
      take: parseInt(limit) || 20,
      skip: parseInt(offset) || 0,
      select: {
        id: true, tipo: true, distanciaKm: true, duracaoSeg: true,
        paceMedio: true, velMedia: true, caloriasEst: true, titulo: true,
        iniciadoEm: true, finalizadoEm: true, compartilhado: true, elevacaoGanho: true
      }
    });
    return atividades;
  });

  // DETALHES COM ROTA
  fastify.get('/gps/atividades/:id', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const atividade = await prisma.atividadeGPS.findUnique({ where: { id: req.params.id } });
    if (!atividade || atividade.userId !== u.userId) return reply.code(404).send({ error: 'Não encontrada' });
    return atividade;
  });

  // ESTATÍSTICAS DO USUÁRIO
  fastify.get('/gps/stats', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const [totais, atividades, ultimaSemana] = await Promise.all([
      prisma.atividadeGPS.aggregate({
        where: { userId: u.userId },
        _sum: { distanciaKm: true, duracaoSeg: true, caloriasEst: true, elevacaoGanho: true },
        _count: true,
        _avg: { distanciaKm: true, velMedia: true },
      }),
      prisma.atividadeGPS.findMany({
        where: { userId: u.userId },
        orderBy: { iniciadoEm: 'desc' },
        take: 5,
        select: { distanciaKm: true, paceMedio: true, iniciadoEm: true, tipo: true }
      }),
      prisma.atividadeGPS.aggregate({
        where: {
          userId: u.userId,
          iniciadoEm: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        },
        _sum: { distanciaKm: true, duracaoSeg: true },
        _count: true
      })
    ]);

    return {
      totalKm: parseFloat((totais._sum.distanciaKm || 0).toFixed(2)),
      totalAtividades: totais._count,
      totalCalorias: totais._sum.caloriasEst || 0,
      totalElevacao: parseFloat((totais._sum.elevacaoGanho || 0).toFixed(0)),
      mediaKm: parseFloat((totais._avg.distanciaKm || 0).toFixed(2)),
      mediaVelocidade: parseFloat((totais._avg.velMedia || 0).toFixed(2)),
      semana: {
        km: parseFloat((ultimaSemana._sum.distanciaKm || 0).toFixed(2)),
        atividades: ultimaSemana._count,
      },
      ultimas: atividades
    };
  });

  // FEED DE ATIVIDADES (público — atividades compartilhadas)
  fastify.get('/gps/feed', async (req) => {
    const { limit } = req.query;
    return prisma.atividadeGPS.findMany({
      where: { compartilhado: true },
      include: { user: { select: { name: true, photo: true, city: true, state: true } } },
      orderBy: { iniciadoEm: 'desc' },
      take: parseInt(limit) || 20,
      select: {
        id: true, tipo: true, distanciaKm: true, duracaoSeg: true,
        paceMedio: true, velMedia: true, caloriasEst: true, titulo: true,
        iniciadoEm: true, compartilhado: true,
        user: { select: { name: true, photo: true, city: true } }
      }
    });
  });

  // RANKING SEMANAL GPS
  fastify.get('/gps/ranking', async (req) => {
    const { periodo } = req.query;
    const desde = periodo === 'mes'
      ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const ranking = await prisma.atividadeGPS.groupBy({
      by: ['userId'],
      where: { iniciadoEm: { gte: desde } },
      _sum: { distanciaKm: true },
      _count: true,
      orderBy: { _sum: { distanciaKm: 'desc' } },
      take: 50
    });

    const userIds = ranking.map(r => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, photo: true, city: true, state: true }
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    return ranking.map((r, i) => ({
      posicao: i + 1,
      nome: userMap[r.userId]?.name || 'Atleta',
      foto: userMap[r.userId]?.photo,
      cidade: userMap[r.userId]?.city,
      estado: userMap[r.userId]?.state,
      kmTotal: parseFloat((r._sum.distanciaKm || 0).toFixed(2)),
      atividades: r._count,
    }));
  });
}
