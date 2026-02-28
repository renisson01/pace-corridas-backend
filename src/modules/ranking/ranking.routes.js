import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function rankingRoutes(fastify) {

  // RANKING GERAL - ordenado por pontos
  fastify.get('/ranking', async (req) => {
    const { estado, genero, limit = 100 } = req.query;
    const where = {};
    if (estado) where.state = estado;
    if (genero) where.gender = genero;

    const atletas = await prisma.athlete.findMany({
      where,
      orderBy: { totalPoints: 'desc' },
      take: parseInt(limit),
      select: {
        id: true,
        name: true,
        city: true,   // usamos city para equipe nos atletas elite
        state: true,
        gender: true,
        age: true,
        totalRaces: true,
        totalPoints: true,
        results: {
          orderBy: { points: 'desc' },
          take: 3,
          include: { race: { select: { name: true, date: true } } }
        }
      }
    });

    // Calcular nível de cada atleta pelo melhor tempo de maratona
    return atletas.map((a, i) => {
      const melhorMaratona = a.results.find(r => r.distance?.includes('42'));
      const nivel = calcularNivel(a.totalPoints, melhorMaratona?.time);
      return {
        ...a,
        posicao: i + 1,
        nivel: nivel.label,
        nivelCor: nivel.cor,
        melhorProva: a.results[0]?.race?.name || null,
        melhorTempo: a.results[0]?.time || null,
      };
    });
  });

  // RANKING POR ESTADO
  fastify.get('/ranking/estado/:estado', async (req) => {
    const { estado } = req.params;
    const atletas = await prisma.athlete.findMany({
      where: { state: estado },
      orderBy: { totalPoints: 'desc' },
      take: 50,
      select: { id:true, name:true, city:true, state:true, gender:true, totalRaces:true, totalPoints:true }
    });
    return atletas.map((a, i) => ({ ...a, posicao: i + 1 }));
  });

  // TOP MARATONISTAS - pelo melhor tempo de 42km
  fastify.get('/ranking/maratona', async (req) => {
    const { genero } = req.query;
    
    const where = { distance: { contains: '42' } };
    
    const resultados = await prisma.result.findMany({
      where,
      orderBy: { time: 'asc' },
      take: 100,
      include: {
        athlete: { select: { id:true, name:true, city:true, state:true, gender:true } },
        race: { select: { name:true, date:true } }
      }
    });

    // Deduplica - pega só melhor tempo por atleta
    const seen = new Set();
    const top = [];
    for (const r of resultados) {
      if (!seen.has(r.athleteId)) {
        seen.add(r.athleteId);
        if (!genero || r.athlete.gender === genero) {
          top.push({ ...r.athlete, tempo: r.time, prova: r.race.name, posicao: top.length + 1 });
        }
      }
    }
    return top.slice(0, 50);
  });

  // TOP 10KM
  fastify.get('/ranking/10km', async (req) => {
    const resultados = await prisma.result.findMany({
      where: { distance: { contains: '10' } },
      orderBy: { time: 'asc' },
      take: 200,
      include: {
        athlete: { select: { id:true, name:true, city:true, gender:true } },
        race: { select: { name:true } }
      }
    });
    const seen = new Set();
    const top = [];
    for (const r of resultados) {
      if (!seen.has(r.athleteId)) {
        seen.add(r.athleteId);
        top.push({ ...r.athlete, tempo: r.time, prova: r.race.name, posicao: top.length + 1 });
      }
    }
    return top.slice(0, 50);
  });

  // STATS GERAIS
  fastify.get('/ranking/stats', async (req) => {
    const [totalAtletas, totalResultados, totalCorridas] = await Promise.all([
      prisma.athlete.count(),
      prisma.result.count(),
      prisma.race.count(),
    ]);
    return { totalAtletas, totalResultados, totalCorridas };
  });
}

function calcularNivel(pontos, tempoMaratona) {
  // Por pontos acumulados
  if (pontos >= 12000) return { label: '⭐ Elite Mundial',   cor: '#FFD700' };
  if (pontos >= 7000)  return { label: '🔥 Elite Nacional',  cor: '#FF6B35' };
  if (pontos >= 3000)  return { label: '💪 Elite Regional',  cor: '#4A90D9' };
  if (pontos >= 1000)  return { label: '📈 Sub-Elite',       cor: '#22c55e' };
  return                      { label: '🌱 Avançado',        cor: '#94a3b8' };
}
