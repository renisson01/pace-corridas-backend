import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const PONTOS_GERAL = [100,85,75,65,55,48,42,37,33,30,27,24,21,18,16,14,12,10,9,8,7,6,5,4,3,2,1];
const PONTOS_FAIXA = [40,30,20,15,10,8,6,4,2,1];

function calcPace(time,distance){
  if(!time||!distance) return '0:00';
  try{
    const d=parseFloat(String(distance).replace('km','').replace(',','.'));
    const p=String(time).split(':').map(Number);
    let s=p.length===3?p[0]*3600+p[1]*60+p[2]:p[0]*60+p[1];
    const pm=Math.floor(s/d/60),ps=Math.round((s/d)%60);
    return pm+':'+(String(ps).padStart(2,'0'));
  }catch{return '0:00';}
}

export async function scraperRoutes(fastify) {

  // STATUS GERAL
  fastify.get('/scraper/status', async () => {
    const [totalRaces,totalResults,athletes] = await Promise.all([
      prisma.race.count(),
      prisma.result.count(),
      prisma.athlete.count()
    ]);
    return { status:'online', totalRaces, totalResults, athletes };
  });

  // IMPORTAR CSV
  fastify.post('/scraper/import', async (req,reply) => {
    const { raceId, distance, results } = req.body;
    if(!raceId||!results||!Array.isArray(results))
      return reply.code(400).send({error:'Envie raceId, distance, results[]'});
    const race = await prisma.race.findUnique({where:{id:raceId}});
    if(!race) return reply.code(404).send({error:'Corrida nao encontrada'});
    let ok=0,err=0;
    for(const r of results){
      try{
        let athlete = await prisma.athlete.findFirst({where:{name:{equals:r.name,mode:'insensitive'}}});
        if(!athlete) athlete = await prisma.athlete.create({data:{name:r.name,age:r.age||0,gender:r.gender||'M',city:r.city||race.city,state:r.state||race.state}});
        await prisma.result.create({data:{
          raceId,athleteId:athlete.id,
          distance:distance||r.distance||'0',
          time:r.time||'00:00:00',
          pace:r.pace||calcPace(r.time,distance),
          overallRank:r.overallRank||0,
          genderRank:r.genderRank||0,
          ageGroupRank:r.ageGroupRank||0,
          ageGroup:r.ageGroup||'Geral'
        }});
        ok++;
      }catch(e){err++;console.error('Erro:',r.name,e.message);}
    }
    return {success:true,inseridos:ok,erros:err,raceName:race.name};
  });

  // RESULTADOS DE UMA CORRIDA
  fastify.get('/races/:id/results', async (req) => {
    const {id}=req.params;
    const {distance,gender,ageGroup,limit=100}=req.query;
    const where={raceId:id};
    if(distance) where.distance=distance;
    if(ageGroup) where.ageGroup=ageGroup;
    const results = await prisma.result.findMany({
      where,
      include:{athlete:{select:{name:true,gender:true,city:true,state:true,age:true}}},
      orderBy:{overallRank:'asc'},
      take:parseInt(limit)
    });
    const filtered = gender ? results.filter(r=>r.athlete?.gender===gender) : results;
    const race = await prisma.race.findUnique({where:{id}});
    return {race:race?{id:race.id,name:race.name,date:race.date,city:race.city}:null,total:filtered.length,results:filtered};
  });

  // TOP 5 MASCULINO E FEMININO
  fastify.get('/races/:id/top5', async (req) => {
    const {id}=req.params;
    const {distance}=req.query;
    const where={raceId:id};
    if(distance) where.distance=distance;
    const all = await prisma.result.findMany({
      where,
      include:{athlete:{select:{name:true,gender:true,city:true,state:true}}},
      orderBy:{overallRank:'asc'}
    });
    const masc = all.filter(r=>r.athlete?.gender==='M').slice(0,5);
    const fem  = all.filter(r=>r.athlete?.gender==='F').slice(0,5);
    const race = await prisma.race.findUnique({where:{id}});
    const fmt  = r=>({pos:r.overallRank,nome:r.athlete?.name,cidade:r.athlete?.city,estado:r.athlete?.state,tempo:r.time,pace:r.pace,faixa:r.ageGroup});
    return {race:race?.name,distance,masculino:masc.map(fmt),feminino:fem.map(fmt)};
  });

  // RANKING BRASIL POR TEMPO
  fastify.get('/rankings/brazil', async (req) => {
    const {distance,gender,ageGroup,state,limit=100}=req.query;
    const where={};
    if(distance) where.distance={contains:distance};
    if(ageGroup) where.ageGroup=ageGroup;
    if(gender||state){where.athlete={};if(gender)where.athlete.gender=gender;if(state)where.athlete.state=state;}
    const results = await prisma.result.findMany({
      where,
      include:{
        athlete:{select:{name:true,gender:true,city:true,state:true,age:true}},
        race:{select:{name:true,date:true,city:true}}
      },
      orderBy:{time:'asc'},
      take:parseInt(limit)
    });
    return {total:results.length,ranking:results.map((r,i)=>({
      rank:i+1,athlete:r.athlete?.name,gender:r.athlete?.gender,
      city:r.athlete?.city,state:r.athlete?.state,
      time:r.time,pace:r.pace,ageGroup:r.ageGroup,
      race:r.race?.name,raceDate:r.race?.date
    }))};
  });

  // RANKING POR PONTUACAO ACUMULADA
  fastify.get('/rankings/points', async (req) => {
    const {gender,state,limit=50}=req.query;
    const where={};
    if(gender||state){where.athlete={};if(gender)where.athlete.gender=gender;if(state)where.athlete.state=state;}
    const results = await prisma.result.findMany({
      where,
      include:{athlete:{select:{id:true,name:true,gender:true,city:true,state:true}}}
    });
    const map={};
    for(const r of results){
      const aid=r.athleteId;
      if(!map[aid]) map[aid]={athlete:r.athlete,pontos:0,corridas:0,podiosGeral:0,podiosFaixa:0};
      if(r.overallRank>0&&r.overallRank<=PONTOS_GERAL.length){
        map[aid].pontos+=PONTOS_GERAL[r.overallRank-1];
        if(r.overallRank<=3) map[aid].podiosGeral++;
      }
      if(r.ageGroupRank>0&&r.ageGroupRank<=PONTOS_FAIXA.length&&r.ageGroup&&r.ageGroup!=='Geral'){
        map[aid].pontos+=PONTOS_FAIXA[r.ageGroupRank-1];
        if(r.ageGroupRank<=3) map[aid].podiosFaixa++;
      }
      map[aid].corridas++;
    }
    const ranking = Object.values(map)
      .sort((a,b)=>b.pontos-a.pontos)
      .slice(0,parseInt(limit))
      .map((a,i)=>({rank:i+1,...a}));
    return {total:ranking.length,ranking};
  });
}

  // MERGE DUPLICATAS
  fastify.post('/scraper/merge-athletes', async (req,reply) => {
    const key = req.headers['x-api-key'];
    if(key !== (process.env.ADMIN_API_KEY||'pace-admin-2026'))
      return reply.code(401).send({error:'Não autorizado'});
    const { mergeDuplicates } = await import('./athlete-matcher.js');
    const result = await mergeDuplicates();
    return {success:true,...result};
  });
