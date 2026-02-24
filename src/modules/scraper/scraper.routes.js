import { scraperService } from './scraper.service.js';

export async function scraperRoutes(fastify) {
  fastify.post('/scraper/run', async () => {
    const result = await scraperService.scrapeAllSites();
    return result;
  });

  fastify.get('/scraper/status', async () => {
    const total = await prisma.race.count();
    return { totalRaces: total };
  });
}
