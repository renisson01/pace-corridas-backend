import prisma from '../../lib/prisma.js';
import { racesService } from './races.service.js';

export async function raceRoutes(fastify) {
  fastify.get('/races', async (req) => {
    const { state, city, status, distance, month, limit } = req.query;
    return racesService.findAll({ state, city, status, distance, month, limit });
  });

  fastify.get('/races/search', async (req) => {
    return racesService.search(req.query.q || '');
  });

  fastify.get('/races/stats', async () => {
    return racesService.stats();
  });

  fastify.get('/races/:id', async (req, reply) => {
    const race = await racesService.findById(req.params.id);
    if (!race) return reply.code(404).send({ error: 'Corrida não encontrada' });
    return race;
  });

  fastify.get('/races/:id/top5', async (req, reply) => {
    const { id } = req.params;
    const { distance } = req.query;
    const where = { raceId: id };
    if (distance) where.distance = distance;
    const results = await prisma.result.findMany({
      where, orderBy: { overallRank: 'asc' }, take: 100
    });
    const race = await prisma.race.findUnique({ where: { id } });
    const masc = results.filter(r => r.gender === 'M').slice(0, 5).map(r => ({
      pos: r.genderRank || r.overallRank, nome: r.name,
      cidade: r.city || '', tempo: r.time, pace: r.pace || '', faixa: r.ageGroup || ''
    }));
    const fem = results.filter(r => r.gender === 'F').slice(0, 5).map(r => ({
      pos: r.genderRank || r.overallRank, nome: r.name,
      cidade: r.city || '', tempo: r.time, pace: r.pace || '', faixa: r.ageGroup || ''
    }));
    return { race: race?.name || '', masculino: masc, feminino: fem };
  });

  fastify.get('/races/:id/distances', async (req) => {
    const results = await prisma.result.findMany({
      where: { raceId: req.params.id },
      select: { distance: true },
      distinct: ['distance']
    });
    return results.map(r => r.distance).filter(Boolean);
  });

  fastify.get('/races/:id/results', async (req) => {
    const { distance, gender, page = 1, limit = 50 } = req.query;
    const where = { raceId: req.params.id };
    if (distance) where.distance = distance;
    if (gender) where.gender = gender;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [total, results] = await Promise.all([
      prisma.result.count({ where }),
      prisma.result.findMany({ where, orderBy: { overallRank: 'asc' }, skip, take: parseInt(limit) })
    ]);
    return { total, page: parseInt(page), results };
  });

  fastify.get('/races/:id/agegroups', async (req) => {
    const { distance } = req.query;
    const where = { raceId: req.params.id };
    if (distance) where.distance = distance;
    const results = await prisma.result.findMany({
      where, orderBy: { ageGroupRank: 'asc' }
    });
    const grupos = {};
    results.forEach(r => {
      const key = `${r.ageGroup}-${r.gender}`;
      if (!grupos[key]) grupos[key] = { ageGroup: r.ageGroup, gender: r.gender, results: [] };
      if (grupos[key].results.length < 3) grupos[key].results.push(r);
    });
    return Object.values(grupos);
  });
}
