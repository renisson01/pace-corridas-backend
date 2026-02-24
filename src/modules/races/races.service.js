import { prisma } from '../../utils/prisma.js';

export const racesService = {
  async create(data) {
    return await prisma.race.create({
      data: {
        ...data,
        date: new Date(data.date),
        distances: Array.isArray(data.distances) ? data.distances.join(',') : data.distances
      }
    });
  },

  async findAll(filters = {}) {
    const where = {};
    if (filters.state) where.state = filters.state;
    if (filters.city) where.city = filters.city;
    if (filters.status) where.status = filters.status;
    
    const races = await prisma.race.findMany({
      where,
      orderBy: { date: 'asc' }
    });
    
    return races.map(race => ({
      ...race,
      distances: race.distances.split(','),
      _count: { results: 0 }
    }));
  },

  async findById(id) {
    const race = await prisma.race.findUnique({
      where: { id },
      include: {
        results: {
          include: {
            athlete: true
          }
        }
      }
    });
    
    if (race) {
      race.distances = race.distances.split(',');
    }
    
    return race;
  },

  async update(id, data) {
    if (data.date) {
      data.date = new Date(data.date);
    }
    if (data.distances && Array.isArray(data.distances)) {
      data.distances = data.distances.join(',');
    }
    return await prisma.race.update({ where: { id }, data });
  },

  async delete(id) {
    return await prisma.race.delete({ where: { id } });
  }
};
