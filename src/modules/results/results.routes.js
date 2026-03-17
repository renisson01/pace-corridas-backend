import { resultsService } from './results.service.js';
import prisma from '../../lib/prisma.js';

export async function resultsRoutes(fastify) {
  fastify.post('/results', async (request) => {
    const data = request.body;
    const result = await resultsService.create(data);
    await resultsService.calculateRankings(data.raceId, data.distance);
    return result;
  });

  fastify.get('/results/race/:raceId', async (request) => {
    const { raceId } = request.params;
    const { distance } = request.query;
    return await resultsService.findByRace(raceId, distance);
  });

  fastify.post('/results/calculate-rankings', async (request) => {
    const { raceId, distance } = request.body;
    return await resultsService.calculateRankings(raceId, distance);
  });

  fastify.get('/results/me', async (req, reply) => {
    try {
      const auth = req.headers.authorization?.replace('Bearer ', '');
      if (!auth) return reply.code(401).send({ error: 'Nao autorizado' });
      const jwt = await import('jsonwebtoken');
      const decoded = jwt.default.verify(auth, process.env.JWT_SECRET || 'pace-secret-2026');
      const results = await prisma.result.findMany({
        where: { athlete: { user: { id: decoded.userId } } },
        include: { race: { select: { name: true, city: true, state: true } } },
        orderBy: { createdAt: 'desc' }
      });
      return results;
    } catch(e) {
      return reply.code(401).send({ error: 'Token invalido' });
    }
  });

  fastify.delete('/results/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      await prisma.result.delete({ where: { id } });
      return { deleted: true };
    } catch(e) {
      return reply.code(404).send({ error: 'Nao encontrado' });
    }
  });
}
