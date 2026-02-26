import { getRankingByPoints, getRankingByTime, getTop5 } from '../../services/rankingService.js';
import { analyzeAthlete } from '../../services/analysisService.js';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function rankingRoutes(fastify) {

  fastify.get('/rankings/points', async(req) => {
    const { gender, state, limit=50 } = req.query;
    const ranking = await getRankingByPoints({ gender, state, limit });
    return { total:ranking.length, ranking };
  });

  fastify.get('/rankings/brazil', async(req) => {
    const { distance, gender, ageGroup, state, limit=100 } = req.query;
    const ranking = await getRankingByTime({ distance, gender, ageGroup, state, limit });
    return { total:ranking.length, ranking };
  });

  fastify.get('/races/:id/top5', async(req) => {
    const { id } = req.params;
    const { distance } = req.query;
    const race = await prisma.race.findUnique({ where:{id} });
    const { masculino, feminino } = await getTop5({ raceId:id, distance });
    return { race:race?.name, distance, masculino, feminino };
  });

  fastify.get('/athletes/:id/analysis', async(req, reply) => {
    const { id } = req.params;
    const athlete = await prisma.athlete.findUnique({ where:{id} });
    if(!athlete) return reply.code(404).send({ error:'Atleta não encontrado' });
    const results = await prisma.result.findMany({
      where:{ athleteId:id },
      include:{ race:{ select:{name:true,date:true,city:true} } },
      orderBy:{ race:{ date:'asc' } }
    });
    const analysis = analyzeAthlete(results);
    return { athlete, analysis };
  });

  fastify.get('/athletes/search', async(req) => {
    const { q, city, state, gender, limit=20 } = req.query;
    const where = {};
    if(q) where.name = { contains:q, mode:'insensitive' };
    if(city) where.city = { contains:city, mode:'insensitive' };
    if(state) where.state = state;
    if(gender) where.gender = gender;
    const athletes = await prisma.athlete.findMany({
      where, take:parseInt(limit),
      include:{ _count:{ select:{ results:true } } }
    });
    return athletes.map(a => ({
      id:a.id, name:a.name, age:a.age, gender:a.gender,
      city:a.city, state:a.state, totalRaces:a._count.results
    }));
  });
}
