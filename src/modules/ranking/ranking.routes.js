import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

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

  fastify.get('/ranking', async (req) => {
    const { genero, estado, limit = 100 } = req.query;
    const where = {};
    if (genero) where.gender = genero;
    if (estado) where.state = estado;
    const atletas = await prisma.athlete.findMany({
      where, orderBy: { totalPoints: 'desc' }, take: parseInt(limit),
      select: {
        id:true, name:true, equipe:true, state:true, gender:true,
        totalRaces:true, totalPoints:true, age:true,
        results: { orderBy: { points: 'desc' }, take: 1, include: { race: { select: { name:true } } } }
      }
    });
    return atletas.map((a, i) => {
      const n = nivelAtleta(a.totalPoints);
      return {
        posicao: i+1, id:a.id, name:a.name, equipe:a.equipe||null,
        state:a.state||null, gender:a.gender, totalRaces:a.totalRaces,
        totalPoints:a.totalPoints, nivel:n.label, nivelCor:n.cor,
        melhorProva:a.results[0]?.race?.name||null
      };
    });
  });

  fastify.get('/ranking/42km', async (req) => { return await rankingPorDistancia('42', req.query.genero); });
  fastify.get('/ranking/21km', async (req) => { return await rankingPorDistancia('21', req.query.genero); });
  fastify.get('/ranking/15km', async (req) => { return await rankingPorDistancia('15', req.query.genero); });
  fastify.get('/ranking/10km', async (req) => { return await rankingPorDistancia('10', req.query.genero); });
  fastify.get('/ranking/5km',  async (req) => { return await rankingPorDistancia('5',  req.query.genero); });

  fastify.get('/ranking/stats', async () => {
    const [totalAtletas, totalResultados, totalCorridas] = await Promise.all([
      prisma.athlete.count(), prisma.result.count(), prisma.race.count()
    ]);
    return { totalAtletas, totalResultados, totalCorridas };
  });

  fastify.get('/buscar-atletas', async (req) => {
    const { nome, estado, limit = 20 } = req.query;
    const where = {};
    if (nome)   where.name  = { contains: nome, mode: 'insensitive' };
    if (estado) where.state = estado;
    const atletas = await prisma.athlete.findMany({
      where, take: parseInt(limit), orderBy: { totalPoints: 'desc' },
      select: {
        id:true, name:true, equipe:true, state:true, gender:true,
        totalPoints:true, totalRaces:true,
        results: { orderBy: { points: 'desc' }, take: 1, include: { race: { select: { name:true } } } }
      }
    });
    return atletas.map((a, i) => ({
      posicao: i+1, id:a.id, name:a.name, equipe:a.equipe||null,
      state:a.state||null, gender:a.gender, totalPoints:a.totalPoints,
      totalRaces:a.totalRaces, nivel:nivelAtleta(a.totalPoints).label,
      melhorProva:a.results[0]?.race?.name||null
    }));
  });

}

async function rankingPorDistancia(distKm, genero) {
  const where = {};
  if (genero) where.gender = genero;
  const atletas = await prisma.athlete.findMany({
    where,
    select: {
      id:true, name:true, equipe:true, state:true, gender:true, totalPoints:true,
      results: { where: { distance: { contains: distKm } }, select: { time:true, overallRank:true } }
    }
  });
  return atletas
    .filter(a => a.results.length > 0)
    .map(a => {
      const melhor = a.results.reduce((best, r) =>
        tempoParaSegundos(r.time) < tempoParaSegundos(best.time) ? r : best
      );
      return {
        id:a.id, name:a.name, equipe:a.equipe||null, state:a.state||null,
        gender:a.gender, totalPoints:a.totalPoints,
        nivel:nivelAtleta(a.totalPoints).label, melhorTempo:melhor.time
      };
    })
    .sort((a, b) => tempoParaSegundos(a.melhorTempo) - tempoParaSegundos(b.melhorTempo))
    .map((a, i) => ({ ...a, posicao: i+1 }));
}
