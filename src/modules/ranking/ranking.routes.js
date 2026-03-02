import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

// Converte "2:14:30" ou "0:46:59" em segundos para comparação
function tempoParaSegundos(t) {
  if (!t) return 999999;
  const parts = t.split(':').map(Number);
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  if (parts.length === 2) return parts[0]*60 + parts[1];
  return 999999;
}

function nivelAtleta(pts) {
  if (pts >= 12000) return { label:'⭐ Elite Mundial',  cor:'yellow' };
  if (pts >= 7000)  return { label:'🔥 Elite Nacional', cor:'orange' };
  if (pts >= 3000)  return { label:'💪 Elite Regional', cor:'blue'   };
  if (pts >= 1000)  return { label:'📈 Sub-Elite',      cor:'green'  };
  return                   { label:'🌱 Avançado',       cor:'gray'   };
}

export async function rankingRoutes(fastify) {

  // RANKING GERAL - por pontos acumulados
  fastify.get('/ranking', async (req) => {
    const { genero, estado, limit = 100 } = req.query;
    const where = {};
    if (genero) where.gender = genero;
    if (estado) where.state = estado;

    const atletas = await prisma.athlete.findMany({
      where,
      orderBy: { totalPoints: 'desc' },
      take: parseInt(limit),
      select: {
        id:true, name:true, equipe:true, state:true, gender:true,
        totalRaces:true, totalPoints:true, age:true,
        results: {
          orderBy: { points: 'desc' },
          take: 1,
          include: { race: { select: { name:true } } }
        }
      }
    });

    return atletas.map((a, i) => {
      const n = nivelAtleta(a.totalPoints);
      return {
        posicao: i + 1,
        id: a.id,
        name: a.name,
        equipe: a.equipe || null,
        state: a.state || null,
        gender: a.gender,
        totalRaces: a.totalRaces,
        totalPoints: a.totalPoints,
        nivel: n.label,
        nivelCor: n.cor,
        melhorProva: a.results[0]?.race?.name || null,
      };
    });
  });

  // RANKING 42KM - melhor tempo por atleta (não por corrida)
  fastify.get('/ranking/42km', async (req) => {
    const { genero } = req.query;
    return await rankingPorDistancia('42', genero);
  });

  // RANKING 21KM
  fastify.get('/ranking/21km', async (req) => {
    const { genero } = req.query;
    return await rankingPorDistancia('21', genero);
  });

  // RANKING 15KM
  fastify.get('/ranking/15km', async (req) => {
    const { genero } = req.query;
    return await rankingPorDistancia('15', genero);
  });

  // RANKING 10KM
  fastify.get('/ranking/10km', async (req) => {
    const { genero } = req.query;
    return await rankingPorDistancia('10', genero);
  });

  // RANKING 5KM
  fastify.get('/ranking/5km', async (req) => {
    const { genero } = req.query;
    return await rankingPorDistancia('5', genero);
  });

  // STATS
  fastify.get('/ranking/stats', async () => {
    const [totalAtletas, totalResultados, totalCorridas] = await Promise.all([
      prisma.athlete.count(), prisma.result.count(), prisma.race.count()
    ]);
    return { totalAtletas, totalResultados, totalCorridas };
  });
}

async function rankingPorDistancia(distKm, genero) {
  const atletaWhere = {};
  if (genero) atletaWhere.gender = genero;

  const atletas = await prisma.athlete.findMany({
    where: atletaWhere,
    select: {
      id:true, name:true, equipe:true, state:true, gender:true, totalPoints:true,
      results: {
        where: { distance: { contains: distKm } },
        select: { time:true, overallRank:true }
      }
    }
  });

  // Filtrar só quem tem resultado nessa distância
  const comResultado = atletas
    .filter(a => a.results.length > 0)
    .map(a => {
      // Pegar MELHOR TEMPO (menor em segundos)
      const melhor = a.results.reduce((best, r) => {
        const s = tempoParaSegundos(r.time);
        return s < tempoParaSegundos(best.time) ? r : best;
      });
      return {
        id: a.id,
        name: a.name,
        equipe: a.equipe || null,
        state: a.state || null,
        gender: a.gender,
        totalPoints: a.totalPoints,
        nivel: nivelAtleta(a.totalPoints).label,
        melhorTempo: melhor.time,
      };
    })
    .sort((a, b) => tempoParaSegundos(a.melhorTempo) - tempoParaSegundos(b.melhorTempo))
    .map((a, i) => ({ ...a, posicao: i + 1 }));

  return comResultado;
}
