
import { getRankingByPoints, getRankingByTime, getTop5 } from '../../services/rankingService.js';
import { analyzeAthlete } from '../../services/analysisService.js';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function rankingRoutes(fastify) {

  // RANKING POR PONTUAÇÃO
  fastify.get('/rankings/points', async(req) => {
    const { gender, state, limit=50 } = req.query;
    const ranking = await getRankingByPoints({ gender, state, limit });
    return { total:ranking.length, ranking };
  });

  // RANKING POR TEMPO
  fastify.get('/rankings/brazil', async(req) => {
    const { distance, gender, ageGroup, state, limit=100 } = req.query;
    const ranking = await getRankingByTime({ distance, gender, ageGroup, state, limit });
    return { total:ranking.length, ranking };
  });

  // TOP 5 MASCULINO/FEMININO
  fastify.get('/races/:id/top5', async(req) => {
    const { id } = req.params;
    const { distance } = req.query;
    const race = await prisma.race.findUnique({ where:{id} });
    const { masculino, feminino } = await getTop5({ raceId:id, distance });
    return { race:race?.name, distance, masculino, feminino };
  });

  // ANÁLISE COMPLETA DO ATLETA
  fastify.get('/athletes/:id/analysis', async(req, reply) => {
    const { id } = req.params;
    const athlete = await prisma.athlete.findUnique({ where:{id} });
    if(!athlete) return reply.code(404).send({ error:'Atleta não encontrado' });
    const results = await prisma.result.findMany({
      where:{ athleteId:id },
      include:{ race:{ select:{name:true,date:true,city:true,state:true} } },
      orderBy:{ race:{ date:'asc' } }
    });
    const analysis = analyzeAthlete(results);
    return {
      athlete:{ id:athlete.id,name:athlete.name,age:athlete.age,gender:athlete.gender,city:athlete.city,state:athlete.state },
      analysis,
      recentResults: results.slice(-5).reverse().map(r=>({
        race:r.race?.name, date:r.race?.date, distance:r.distance,
        time:r.time, pace:r.pace, rank:r.overallRank, faixa:r.ageGroup
      }))
    };
  });

  // BUSCAR ATLETAS
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

  // PERFIL PÚBLICO DO ATLETA
  fastify.get('/athletes/:id/profile', async(req, reply) => {
    const { id } = req.params;
    const athlete = await prisma.athlete.findUnique({ where:{id} });
    if(!athlete) return reply.code(404).send({ error:'Não encontrado' });
    const results = await prisma.result.findMany({
      where:{ athleteId:id },
      include:{ race:{ select:{name:true,date:true,city:true} } },
      orderBy:{ race:{ date:'desc' } }
    });
    const analysis = analyzeAthlete(results);
    return {
      athlete:{ id:athlete.id,name:athlete.name,age:athlete.age,gender:athlete.gender,city:athlete.city,state:athlete.state },
      stats:{ totalRaces:results.length, totalKm:analysis?.totalKm||0, podios:analysis?.podios||0, points:analysis?.totalPoints||0 },
      analysis,
      results: results.slice(0,10).map(r=>({
        race:r.race?.name, date:r.race?.date, city:r.race?.city,
        distance:r.distance, time:r.time, pace:r.pace,
        rank:r.overallRank, faixa:r.ageGroup
      }))
    };
  });
}
