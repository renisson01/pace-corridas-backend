import prisma from '../../lib/prisma.js';

export async function athleteRoutes(fastify) {

  // GET /athletes/search?name=RENISSON&birthYear=1994
  // Busca atleta por nome e opcionalmente ano de nascimento
  fastify.get('/athletes/search', async (req, reply) => {
    const { name, birthYear, limit = 20 } = req.query;

    if (!name || name.length < 3) {
      return reply.code(400).send({ error: 'Nome deve ter pelo menos 3 caracteres' });
    }

    const athletes = await prisma.athlete.findMany({
      where: {
        name: { contains: name.toUpperCase(), mode: 'insensitive' },
        ...(birthYear && {
          age: {
            gte: new Date().getFullYear() - parseInt(birthYear) - 1,
            lte: new Date().getFullYear() - parseInt(birthYear) + 1,
          }
        })
      },
      include: {
        results: {
          include: { race: { select: { id: true, name: true, date: true, city: true, state: true } } },
          orderBy: { race: { date: 'desc' } },
          take: 50,
        }
      },
      take: parseInt(limit),
      orderBy: { totalRaces: 'desc' }
    });

    return { total: athletes.length, athletes };
  });

  // GET /athletes/:id — perfil completo do atleta
  fastify.get('/athletes/:id', async (req, reply) => {
    const athlete = await prisma.athlete.findUnique({
      where: { id: req.params.id },
      include: {
        results: {
          include: { race: { select: { id: true, name: true, date: true, city: true, state: true, distances: true } } },
          orderBy: { race: { date: 'desc' } },
        }
      }
    });

    if (!athlete) return reply.code(404).send({ error: 'Atleta não encontrado' });

    // Estatísticas
    const tempos5k = athlete.results.filter(r => r.distance === '5K' && r.time).map(r => r.time);
    const tempos10k = athlete.results.filter(r => r.distance === '10K' && r.time).map(r => r.time);
    const tempos21k = athlete.results.filter(r => r.distance === '21K' && r.time).map(r => r.time);

    const melhorTempo = (tempos) => {
      if (!tempos.length) return null;
      return tempos.sort()[0];
    };

    const stats = {
      totalCorridas: athlete.results.length,
      distancias: {
        '5K': { total: tempos5k.length, melhor: melhorTempo(tempos5k) },
        '10K': { total: tempos10k.length, melhor: melhorTempo(tempos10k) },
        '21K': { total: tempos21k.length, melhor: melhorTempo(tempos21k) },
      },
      primeiraProva: athlete.results[athlete.results.length - 1]?.race?.date || null,
      ultimaProva: athlete.results[0]?.race?.date || null,
      estados: [...new Set(athlete.results.map(r => r.race?.state).filter(Boolean))],
    };

    return { athlete, stats };
  });

  // GET /athletes/:id/history — histórico completo
  fastify.get('/athletes/:id/history', async (req, reply) => {
    const { page = 1, limit = 20, distance } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      athleteId: req.params.id,
      ...(distance && { distance })
    };

    const [results, total] = await Promise.all([
      prisma.result.findMany({
        where,
        include: { race: { select: { id: true, name: true, date: true, city: true, state: true } } },
        orderBy: { race: { date: 'desc' } },
        skip,
        take: parseInt(limit),
      }),
      prisma.result.count({ where })
    ]);

    return { total, page: parseInt(page), results };
  });

  
}
