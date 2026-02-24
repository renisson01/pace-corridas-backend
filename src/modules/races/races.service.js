import { prisma } from '../../utils/prisma.js';

export const racesService = {
  async findAll(filters = {}) {
    const where = {};
    
    if (filters.state) where.state = filters.state;
    if (filters.city) where.city = { contains: filters.city, mode: 'insensitive' };
    if (filters.status) where.status = filters.status;
    if (filters.distance) where.distances = { contains: filters.distance };
    
    if (filters.month) {
      const year = new Date().getFullYear();
      const startDate = new Date(year, parseInt(filters.month) - 1, 1);
      const endDate = new Date(year, parseInt(filters.month), 0);
      where.date = { gte: startDate, lte: endDate };
    }

    const races = await prisma.race.findMany({
      where,
      orderBy: { date: 'asc' },
      take: 100
    });

    return races.map(race => ({
      ...race,
      distances: race.distances.split(',')
    }));
  },

  async search(query) {
    const races = await prisma.race.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { city: { contains: query, mode: 'insensitive' } },
          { organizer: { contains: query, mode: 'insensitive' } }
        ]
      },
      take: 50
    });

    return races.map(race => ({
      ...race,
      distances: race.distances.split(',')
    }));
  },

  async getStats() {
    const total = await prisma.race.count();
    const upcoming = await prisma.race.count({ where: { status: 'upcoming' } });
    const byState = await prisma.race.groupBy({
      by: ['state'],
      _count: true
    });

    return { total, upcoming, byState };
  },

  async create(data) {
    return await prisma.race.create({
      data: {
        ...data,
        date: new Date(data.date),
        distances: Array.isArray(data.distances) ? data.distances.join(',') : data.distances
      }
    });
  },

  async findById(id) {
    const race = await prisma.race.findUnique({
      where: { id },
      include: { results: { include: { athlete: true } } }
    });
    
    if (race) race.distances = race.distances.split(',');
    return race;
  }
};
