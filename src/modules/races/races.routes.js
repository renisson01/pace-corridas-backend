import { racesService } from './races.service.js';

export async function racesRoutes(fastify) {
  fastify.get('/races', async (request) => {
    const { state, city, status } = request.query;
    return await racesService.findAll({ state, city, status });
  });

  fastify.get('/races/:id', async (request) => {
    const { id } = request.params;
    const race = await racesService.findById(id);
    if (!race) return { error: 'Corrida não encontrada' };
    return race;
  });

  fastify.post('/races', async (request) => {
    return await racesService.create(request.body);
  });

  fastify.put('/races/:id', async (request) => {
    const { id } = request.params;
    return await racesService.update(id, request.body);
  });

  fastify.delete('/races/:id', async (request) => {
    const { id } = request.params;
    await racesService.delete(id);
    return { message: 'Corrida deletada' };
  });
}
