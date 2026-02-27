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
}
