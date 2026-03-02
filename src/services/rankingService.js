
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { calcPoints, POINTS_GENERAL, POINTS_AGE } from '../utils/ageGroupCalculator.js';
const prisma = new PrismaClient();

export async function getRankingByPoints({ gender, state, limit=50 }) {
  const where = {};
  if(gender||state) {
    where.athlete = {};
    if(gender) where.athlete.gender = gender;
    if(state) where.athlete.state = state;
  }
  const results = await prisma.result.findMany({
    where,
    include: { athlete: { select:{id:true,name:true,gender:true,city:true,state:true,age:true} } }
  });

  const map = {};
  for(const r of results) {
    const aid = r.athleteId;
    if(!map[aid]) map[aid] = { athlete:r.athlete, pontos:0, corridas:0, podiosGeral:0, podiosFaixa:0, distancias:{} };
    const pts = calcPoints(r.overallRank||0, r.ageGroupRank||0, r.ageGroup);
    map[aid].pontos += pts;
    map[aid].corridas++;
    if(r.overallRank<=3) map[aid].podiosGeral++;
    if(r.ageGroupRank<=3 && r.ageGroup && r.ageGroup!=='Geral') map[aid].podiosFaixa++;
    const d = r.distance||'?';
    map[aid].distancias[d] = (map[aid].distancias[d]||0)+1;
  }

  return Object.values(map)
    .sort((a,b)=>b.pontos-a.pontos)
    .slice(0, parseInt(limit))
    .map((a,i) => ({ rank:i+1, ...a }));
}

export async function getRankingByTime({ distance, gender, ageGroup, state, limit=100 }) {
  const where = {};
  if(distance) where.distance = { contains: distance };
  if(ageGroup) where.ageGroup = ageGroup;
  if(gender||state) {
    where.athlete = {};
    if(gender) where.athlete.gender = gender;
    if(state) where.athlete.state = state;
  }
  const results = await prisma.result.findMany({
    where,
    include: {
      athlete: { select:{name:true,gender:true,city:true,state:true,age:true} },
      race: { select:{name:true,date:true,city:true} }
    },
    orderBy: { time:'asc' },
    take: parseInt(limit)
  });
  return results.map((r,i) => ({
    rank: i+1,
    athlete: r.athlete?.name,
    gender: r.athlete?.gender,
    age: r.athlete?.age,
    city: r.athlete?.city,
    state: r.athlete?.state,
    time: r.time,
    pace: r.pace,
    ageGroup: r.ageGroup,
    race: r.race?.name,
    raceDate: r.race?.date
  }));
}

export async function getTop5({ raceId, distance }) {
  const where = { raceId };
  if(distance) where.distance = distance;
  const all = await prisma.result.findMany({
    where,
    include: { athlete:{ select:{name:true,gender:true,city:true,state:true,age:true} } },
    orderBy: { overallRank:'asc' }
  });
  const fmt = r => ({
    pos:r.overallRank, nome:r.athlete?.name,
    genero:r.athlete?.gender, idade:r.athlete?.age,
    cidade:r.athlete?.city, estado:r.athlete?.state,
    tempo:r.time, pace:r.pace, faixa:r.ageGroup
  });
  return {
    masculino: all.filter(r=>r.athlete?.gender==='M').slice(0,5).map(fmt),
    feminino:  all.filter(r=>r.athlete?.gender==='F').slice(0,5).map(fmt)
  };
}
