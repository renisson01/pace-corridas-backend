import { matchService } from './match.service.js';

export async function matchRoutes(fastify) {
  fastify.get('/match', async () => {
    return await matchService.findMatches();
  });
}
