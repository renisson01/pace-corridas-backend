import { resultsService } from './results.service.js';

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
}
