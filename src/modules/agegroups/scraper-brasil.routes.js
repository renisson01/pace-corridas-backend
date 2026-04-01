import prisma from '../../lib/prisma.js';

// SISTEMA DE PONTUAÇÃO PACE
// Pódio Geral: 1º=100pts, 2º=85pts, 3º=75pts, 4º=65pts, 5º=55pts
// Faixa Etária: 1º=40pts, 2º=30pts, 3º=20pts
const PONTOS_GERAL = [100,85,75,65,55,48,42,37,33,30,27,24,21,18,16,14,12,10,9,8,7,6,5,4,3,2,1];
const PONTOS_FAIXA = [40,30,20,15,10,8,6,4,2,1];

export default async function scraperBrasilRoutes(fastify) {

  // STATUS

  fastify.get('/buscar-atleta', async (req,reply) => {
    const {q, limit=20} = req.query;
    if (!q || q.length < 2) return reply.code(400).send({error:'Query muito curta'});
    const athletes = await prisma.athlete.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      select: { id:true, name:true, gender:true, state:true, totalRaces:true, totalPoints:true },
      take: parseInt(limit),
      orderBy: { totalPoints: 'desc' }
    });

  fastify.get('/scraper/status', async (req,reply) => {
    const [totalRaces,totalResults,athletes] = await Promise.all([
      prisma.race.count(),
      prisma.result.count(),
      prisma.athlete.count()
    ]);
    return { status:'online', totalRaces, totalResults, athletes };
  });

  // IMPORTAR RESULTADOS VIA CSV
  fastify.post('/scraper/import', async (req,reply) => {
    const { raceId, distance, results } = req.body;
    if (!raceId||!results||!Array.isArray(results))
      return reply.code(400).send({error:'Envie raceId, distance, results[]'});
    const race = await prisma.race.findUnique({where:{id:raceId}});
    if (!race) return reply.code(404).send({error:'Corrida nao encontrada'});
    
    let ok=0, err=0;
    for (const r of results) {
      try {
        let athlete = await prisma.athlete.findFirst({where:{name:{equals:r.name,mode:'insensitive'}}});
        if (!athlete) athlete = await prisma.athlete.create({data:{name:r.name,age:r.age||0,gender:r.gender||'M',state:r.state||race.state}});
        await prisma.result.upsert({
          where: { athleteId_raceId_distance: { athleteId: athlete.id, raceId, distance: distance||r.distance||"0" } },
          update: {
            distance:distance||r.distance||'0',
            time:r.time||'00:00:00',
            pace:r.pace||calcPace(r.time,distance),
            overallRank:r.overallRank||0,
            genderRank:r.genderRank||0,
            ageGroupRank:r.ageGroupRank||0,
            ageGroup:r.ageGroup||'Geral'
          },
          create: {
            raceId, athleteId:athlete.id,
            distance:distance||r.distance||'0',
            time:r.time||'00:00:00',
            pace:r.pace||calcPace(r.time,distance),
            overallRank:r.overallRank||0,
            genderRank:r.genderRank||0,
            ageGroupRank:r.ageGroupRank||0,
            ageGroup:r.ageGroup||'Geral'
          }
        });
        ok++;
      } catch(e) { err++; console.error('IMPORT ERR:', r.name, e.message); }
    }
    
    // RECALCULAR PONTOS APÓS IMPORTAR
    await calcularPontos(raceId, distance);
    return {success:true, inseridos:ok, erros:err, raceName:race.name};
  });

  // RESULTADOS DE UMA CORRIDA

  // RANKING BRASIL COM PONTUACAO
  fastify.get('/rankings/brazil', async (req,reply) => {
    const {distance,gender,ageGroup,state,limit=100}=req.query;
    const where={};
    if(distance) where.distance={contains:distance};
    if(ageGroup) where.ageGroup=ageGroup;
    if(gender||state){where.athlete={};if(gender)where.athlete.gender=gender;if(state)where.athlete.state=state;}
    const results=await prisma.result.findMany({where,include:{athlete:{select:{name:true,gender:true,state:true,age:true}},race:{select:{name:true,date:true,city:true}}},orderBy:{time:'asc'},take:parseInt(limit)});
    return {total:results.length,filters:{distance,gender,ageGroup,state},ranking:results.map((r,i)=>({rank:i+1,athlete:r.athlete?.name,gender:r.athlete?.gender,state:r.athlete?.state,time:r.time,pace:r.pace,ageGroup:r.ageGroup,race:r.race?.name,raceDate:r.race?.date}))};
  });

  // TOP 5 MASCULINO E FEMININO DE UMA CORRIDA
  fastify.get('/races/:id/top5', async (req,reply) => {
    const {id}=req.params;
    const {distance}=req.query;
    const where={raceId:id,overallRank:{lte:10}};
    if(distance) where.distance=distance;
    const all=await prisma.result.findMany({where,include:{athlete:{select:{name:true,gender:true,state:true}}},orderBy:{overallRank:'asc'}});
    const masc=all.filter(r=>r.athlete?.gender==='M').slice(0,5);
    const fem=all.filter(r=>r.athlete?.gender==='F').slice(0,5);
    const race=await prisma.race.findUnique({where:{id}});
    return {race:race?.name,distance,masculino:masc.map(r=>({pos:r.overallRank,nome:r.athlete?.name,cidade:r.athlete?.city,tempo:r.time,pace:r.pace,faixa:r.ageGroup})),feminino:fem.map(r=>({pos:r.overallRank,nome:r.athlete?.name,cidade:r.athlete?.city,tempo:r.time,pace:r.pace,faixa:r.ageGroup}))};
  });

  // RANKING POR PONTUACAO ACUMULADA
  fastify.get('/rankings/points', async (req,reply) => {
    const {gender,state,limit=50}=req.query;
    const where={};
    if(gender||state){where.athlete={};if(gender)where.athlete.gender=gender;if(state)where.athlete.state=state;}
    
    const results=await prisma.result.findMany({where,include:{athlete:{select:{id:true,name:true,gender:true,state:true}}}});
    
    // Agrupa por atleta e soma pontos
    const atletaMap={};
    for(const r of results){
      const aid=r.athleteId;
      if(!atletaMap[aid]) atletaMap[aid]={athlete:r.athlete,pontos:0,corridas:0,podios:0,faixas:0};
      
      // Pontos geral
      if(r.overallRank>0 && r.overallRank<=PONTOS_GERAL.length){
        atletaMap[aid].pontos+=PONTOS_GERAL[r.overallRank-1];
        if(r.overallRank<=3) atletaMap[aid].podios++;
      }
      // Pontos faixa etaria (menor valor)
      if(r.ageGroupRank>0 && r.ageGroupRank<=PONTOS_FAIXA.length && r.ageGroup!=='Geral'){
        atletaMap[aid].pontos+=PONTOS_FAIXA[r.ageGroupRank-1];
        if(r.ageGroupRank<=3) atletaMap[aid].faixas++;
      }
      atletaMap[aid].corridas++;
    }
    
    const ranking=Object.values(atletaMap)
      .sort((a,b)=>b.pontos-a.pontos)
      .slice(0,parseInt(limit))
      .map((a,i)=>({rank:i+1,...a}));
    
    return {total:ranking.length,filters:{gender,state},ranking};
  });
}

async function calcularPontos(raceId, distance) {
  // Reservado para futuras integrações
}

function calcPace(time,distance){
  if(!time||!distance) return '0:00';
  try{
    const d=parseFloat(distance.replace('km','').replace(',','.'));
    const p=time.split(':').map(Number);
    let s=p.length===3?p[0]*3600+p[1]*60+p[2]:p[0]*60+p[1];
    const pm=Math.floor(s/d/60),ps=Math.round((s/d)%60);
    return pm+':'+(String(ps).padStart(2,'0'));
  }catch{return '0:00';}


  // BUSCAR ATLETA POR NOME
    return athletes;
  });

  // PERFIL COMPLETO DO ATLETA
  fastify.get('/atleta/:id', async (req,reply) => {
    const {id} = req.params;
    const athlete = await prisma.athlete.findUnique({
      where: { id },
      include: {
        results: {
          include: { race: { select: { name:true, date:true, city:true, state:true } } },
          orderBy: { race: { date: 'desc' } }
        },
        user: { select: { id:true } }
      }
    });
    if (!athlete) return reply.code(404).send({error:'Atleta não encontrado'});

    // Calcular melhores tempos por distância
    const melhoresPorDist = {};
    for (const r of athlete.results) {
      const dist = r.distance || 'Geral';
      if (!r.time || r.time === '00:00:00') continue;
      if (!melhoresPorDist[dist] || r.time < melhoresPorDist[dist].time) {
        melhoresPorDist[dist] = { time: r.time, pace: r.pace || '', race: r.race?.name || '' };
      }
    }

    // Calcular nível
    const pts = athlete.totalPoints || 0;
    let nivel = '🌱 Iniciando';
    if (pts >= 12000) nivel = '⭐ Elite Mundial';
    else if (pts >= 7000) nivel = '🔥 Elite Nacional';
    else if (pts >= 3000) nivel = '💪 Elite Regional';
    else if (pts >= 1000) nivel = '📈 Sub-Elite';
    else if (pts >= 100) nivel = '🏃 Ativo';

    return {
      id: athlete.id,
      name: athlete.name,
      gender: athlete.gender,
      age: athlete.age,
      state: athlete.state,
      equipe: athlete.equipe,
      totalRaces: athlete.results.length,
      totalPoints: pts,
      nivel,
      linkedUserId: athlete.user?.id || null,
      melhoresPorDist,
      provas: athlete.results.map(r => ({
        raceName: r.race?.name || 'Corrida',
        raceDate: r.race?.date,
        raceCity: r.race?.city,
        distance: r.distance,
        time: r.time,
        pace: r.pace,
        overallRank: r.overallRank,
        genderRank: r.genderRank,
        ageGroup: r.ageGroup,
        points: r.points
      }))
    };
  });

  // VINCULAR ATLETA A USUARIO
  fastify.post('/atleta/:id/vincular', async (req,reply) => {
    const {id} = req.params;
    const {userId} = req.body;
    if (!userId) return reply.code(400).send({error:'userId obrigatório'});
    try {
      await prisma.user.update({ where: { id: userId }, data: { athleteId: id } });
      return { ok: true };
    } catch(e) {
      return reply.code(500).send({ error: e.message });
    }
  });

}
