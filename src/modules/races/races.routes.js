import { racesService } from './races.service.js';
import { prisma } from '../../utils/prisma.js';

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

  // Criar corrida
  fastify.post('/races', async (request) => {
    return await racesService.create(request.body);
  });

  // Ver corrida específica
  fastify.get('/races/:id', async (request) => {
    return await racesService.findById(request.params.id);
  });

  // NOVO: Deletar corridas antigas (passadas)
  fastify.delete('/races/cleanup-old', async () => {
    const today = new Date();
    const deleted = await prisma.race.deleteMany({
      where: {
        date: { lt: today }
      }
    });
    return { 
      message: 'Corridas antigas deletadas', 
      count: deleted.count 
    };
  });

  // NOVO: Deletar TODAS as corridas
  fastify.delete('/races/cleanup-all', async () => {
    const deleted = await prisma.race.deleteMany({});
    return { 
      message: 'Todas as corridas deletadas', 
      count: deleted.count 
    };
  });
}
