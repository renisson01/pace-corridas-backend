import { racesService } from './races.service.js';

export async function racesRoutes(fastify) {
  // Listar com filtros
  fastify.get('/races', async (request) => {
    const { state, city, status, distance, month } = request.query;
    return await racesService.findAll({ state, city, status, distance, month });
  });

  // Buscar por texto
  fastify.get('/races/search', async (request) => {
    const { q } = request.query;
    return await racesService.search(q);
  });

  // Estatísticas
  fastify.get('/races/stats', async () => {
    return await racesService.getStats();
  });

  fastify.post('/races', async (request) => {
    return await racesService.create(request.body);
  });

  fastify.get('/races/:id', async (request) => {
    return await racesService.findById(request.params.id);
  });
}
