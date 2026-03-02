import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

export const racesService = {
  async findAll({ state, city, status, distance, month, limit } = {}) {
    const where = {};
    if (state) where.state = state;
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (status) where.status = status;
    if (distance) where.distances = { contains: distance };
    if (month) {
      const ano = new Date().getFullYear();
      const inicio = new Date(ano, parseInt(month)-1, 1);
      const fim = new Date(ano, parseInt(month), 0);
      where.date = { gte: inicio, lte: fim };
    }
    return prisma.race.findMany({
      where,
      orderBy: { date: 'asc' },
      take: parseInt(limit) || 500,
    });
  },

  async findById(id) {
    return prisma.race.findUnique({ where: { id }, include: { results: { include: { athlete: true }, orderBy: { overallRank: 'asc' }, take: 50 } } });
  },

  async search(q) {
    return prisma.race.findMany({
      where: { OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        { organizer: { contains: q, mode: 'insensitive' } },
      ]},
      orderBy: { date: 'asc' },
      take: 20,
    });
  },

  async stats() {
    const [total, upcoming, comLink] = await Promise.all([
      prisma.race.count(),
      prisma.race.count({ where: { status: 'upcoming' } }),
      prisma.race.count({ where: { registrationUrl: { not: null } } }),
    ]);
    const porEstado = await prisma.race.groupBy({ by: ['state'], _count: { id: true }, orderBy: { _count: { id: 'desc' } } });
    return { total, upcoming, comLink, porEstado };
  }
};
