import { prisma } from '../../utils/prisma.js';

export async function analyticsRoutes(fastify) {
  fastify.get('/analytics/overview', async () => {
    const [totalRaces, totalAthletes, totalResults] = await Promise.all([
      prisma.race.count(),
      prisma.athlete.count(),
      prisma.result.count()
    ]);

    const stateDistribution = await prisma.race.groupBy({
      by: ['state'],
      _count: { state: true },
      orderBy: { _count: { state: 'desc' } }
    });

    const topCities = await prisma.race.groupBy({
      by: ['city'],
      _count: { city: true },
      orderBy: { _count: { city: 'desc' } },
      take: 10
    });

    return {
      totalRaces,
      totalAthletes,
      totalResults,
      stateDistribution,
      topCities
    };
  });

  fastify.get('/analytics/growth', async () => {
    const last30Days = await prisma.race.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      }
    });

    return { racesLast30Days: last30Days };
  });
}
