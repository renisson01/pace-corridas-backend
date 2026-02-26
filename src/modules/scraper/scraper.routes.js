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

function normalizeName(name){
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z\s]/g,'').trim();
}

function nameSimilarity(a,b){
  const na=normalizeName(a).split(' ');
  const nb=normalizeName(b).split(' ');
  const firstMatch=na[0]===nb[0];
  const lastMatch=na[na.length-1]===nb[nb.length-1];
  if(firstMatch&&lastMatch) return 1.0;
  if(firstMatch) return 0.7;
  if(lastMatch) return 0.6;
  return 0;
}

async function findOrCreateAthlete(data){
  const {name,age,gender,city,state}=data;
  const candidates=await prisma.athlete.findMany({where:{gender:gender||'M'}});
  let best=null,bestScore=0;
  for(const c of candidates){
    let score=0;
    score+=nameSimilarity(name,c.name)*40;
    if(city&&c.city&&normalizeName(city)===normalizeName(c.city)) score+=30;
    if(age&&c.age){const diff=Math.abs(age-c.age);if(diff===0)score+=30;else if(diff<=2)score+=15;}
    if(score>bestScore){bestScore=score;best=c;}
  }
  if(best&&bestScore>=70) return {athlete:best,isNew:false};
  const a=await prisma.athlete.create({data:{name,age:age||0,gender:gender||'M',city:city||'',state:state||''}});
  return {athlete:a,isNew:true};
}

// ANALISE DE SAUDE - PREVISAO DE RISCO CARDIACO
function analyzeCardiacRisk(results){
  if(!results||results.length<2) return null;
  
  const paces=results.map(r=>{
    const p=r.pace?.split(':').map(Number);
    return p?.length===2?p[0]*60+p[1]:0;
  }).filter(p=>p>0);
  
  if(paces.length<2) return null;
  
  const avg=paces.reduce((a,b)=>a+b,0)/paces.length;
  const recent=paces.slice(-3);
  const recentAvg=recent.reduce((a,b)=>a+b,0)/recent.length;
  const variation=Math.max(...paces)-Math.min(...paces);
  
  // Tendência de piora: pace aumentando (correndo mais devagar)
  const trend=recentAvg-avg;
  const variationPct=(variation/avg)*100;
  
  let riskLevel='BAIXO';
  let riskScore=0;
  const alerts=[];
  
  // Pace piorando muito nas últimas corridas
  if(trend>60){riskScore+=30;alerts.push('Pace piorando nas últimas corridas (+'+Math.round(trend/60)+'min/km)');}
  
  // Variação muito alta entre provas (inconsistência)
  if(variationPct>40){riskScore+=25;alerts.push('Alta variação de desempenho entre provas ('+Math.round(variationPct)+'%)');}
  
  // Pace muito lento para distâncias longas (>8min/km em 10km+)
  const longRaces=results.filter(r=>r.distance?.includes('10km')||r.distance?.includes('21km'));
  if(longRaces.length>0){
    const longPaces=longRaces.map(r=>{const p=r.pace?.split(':').map(Number);return p?.length===2?p[0]*60+p[1]:0;}).filter(p=>p>0);
    const avgLong=longPaces.reduce((a,b)=>a+b,0)/longPaces.length;
    if(avgLong>480){riskScore+=20;alerts.push('Esforço elevado em distâncias longas (pace >8min/km)');}
  }
  
  if(riskScore>=50) riskLevel='ALTO';
  else if(riskScore>=25) riskLevel='MODERADO';
  
  return {
    riskLevel,
    riskScore,
    alerts,
    avgPaceMin:Math.floor(avg/60)+':'+(String(Math.round(avg%60)).padStart(2,'0')),
    trend:trend>0?'PIORANDO':trend<-10?'MELHORANDO':'ESTÁVEL',
    recommendation: riskLevel==='ALTO'
      ? '⚠️ Consulte um cardiologista antes da próxima prova!'
      : riskLevel==='MODERADO'
      ? '⚡ Faça um check-up cardiovascular preventivo.'
      : '✅ Seu padrão de pace está saudável. Continue assim!'
  };
}

export async function scraperRoutes(fastify){

  fastify.get('/scraper/status', async()=>{
    const [totalRaces,totalResults,athletes]=await Promise.all([prisma.race.count(),prisma.result.count(),prisma.athlete.count()]);
    return {status:'online',totalRaces,totalResults,athletes};
  });

  fastify.post('/scraper/import', async(req,reply)=>{
    const {raceId,distance,results}=req.body;
    if(!raceId||!results||!Array.isArray(results)) return reply.code(400).send({error:'Envie raceId, distance, results[]'});
    const race=await prisma.race.findUnique({where:{id:raceId}});
    if(!race) return reply.code(404).send({error:'Corrida nao encontrada'});
    let ok=0,err=0;
    for(const r of results){
      try{
        const {athlete}=await findOrCreateAthlete({name:r.name,age:r.age,gender:r.gender,city:r.city||race.city,state:r.state||race.state});
        await prisma.result.create({data:{raceId,athleteId:athlete.id,distance:distance||r.distance||'0',time:r.time||'00:00:00',pace:r.pace||calcPace(r.time,distance),overallRank:r.overallRank||0,genderRank:r.genderRank||0,ageGroupRank:r.ageGroupRank||0,ageGroup:r.ageGroup||'Geral'}});
        ok++;
      }catch(e){err++;console.error('Erro:',r.name,e.message);}
    }
    return {success:true,inseridos:ok,erros:err,raceName:race.name};
  });

  fastify.get('/races/:id/results', async(req)=>{
    const {id}=req.params;
    const {distance,gender,ageGroup,limit=100}=req.query;
    const where={raceId:id};
    if(distance) where.distance=distance;
    if(ageGroup) where.ageGroup=ageGroup;
    const results=await prisma.result.findMany({where,include:{athlete:{select:{name:true,gender:true,city:true,state:true,age:true}}},orderBy:{overallRank:'asc'},take:parseInt(limit)});
    const filtered=gender?results.filter(r=>r.athlete?.gender===gender):results;
    const race=await prisma.race.findUnique({where:{id}});
    return {race:race?{id:race.id,name:race.name,date:race.date,city:race.city}:null,total:filtered.length,results:filtered};
  });

  fastify.get('/races/:id/top5', async(req)=>{
    const {id}=req.params;
    const {distance}=req.query;
    const where={raceId:id};
    if(distance) where.distance=distance;
    const all=await prisma.result.findMany({where,include:{athlete:{select:{name:true,gender:true,city:true,state:true}}},orderBy:{overallRank:'asc'}});
    const masc=all.filter(r=>r.athlete?.gender==='M').slice(0,5);
    const fem=all.filter(r=>r.athlete?.gender==='F').slice(0,5);
    const race=await prisma.race.findUnique({where:{id}});
    const fmt=r=>({pos:r.overallRank,nome:r.athlete?.name,cidade:r.athlete?.city,tempo:r.time,pace:r.pace,faixa:r.ageGroup});
    return {race:race?.name,distance,masculino:masc.map(fmt),feminino:fem.map(fmt)};
  });

  fastify.get('/rankings/brazil', async(req)=>{
    const {distance,gender,ageGroup,state,limit=100}=req.query;
    const where={};
    if(distance) where.distance={contains:distance};
    if(ageGroup) where.ageGroup=ageGroup;
    if(gender||state){where.athlete={};if(gender)where.athlete.gender=gender;if(state)where.athlete.state=state;}
    const results=await prisma.result.findMany({where,include:{athlete:{select:{name:true,gender:true,city:true,state:true}},race:{select:{name:true,date:true}}},orderBy:{time:'asc'},take:parseInt(limit)});
    return {total:results.length,ranking:results.map((r,i)=>({rank:i+1,athlete:r.athlete?.name,gender:r.athlete?.gender,city:r.athlete?.city,state:r.athlete?.state,time:r.time,pace:r.pace,ageGroup:r.ageGroup,race:r.race?.name}))};
  });

  fastify.get('/rankings/points', async(req)=>{
    const {gender,state,limit=50}=req.query;
    const where={};
    if(gender||state){where.athlete={};if(gender)where.athlete.gender=gender;if(state)where.athlete.state=state;}
    const results=await prisma.result.findMany({where,include:{athlete:{select:{id:true,name:true,gender:true,city:true,state:true}}}});
    const map={};
    for(const r of results){
      const aid=r.athleteId;
      if(!map[aid]) map[aid]={athlete:r.athlete,pontos:0,corridas:0,podiosGeral:0,podiosFaixa:0};
      if(r.overallRank>0&&r.overallRank<=PONTOS_GERAL.length){map[aid].pontos+=PONTOS_GERAL[r.overallRank-1];if(r.overallRank<=3)map[aid].podiosGeral++;}
      if(r.ageGroupRank>0&&r.ageGroupRank<=PONTOS_FAIXA.length&&r.ageGroup&&r.ageGroup!=='Geral'){map[aid].pontos+=PONTOS_FAIXA[r.ageGroupRank-1];if(r.ageGroupRank<=3)map[aid].podiosFaixa++;}
      map[aid].corridas++;
    }
    const ranking=Object.values(map).sort((a,b)=>b.pontos-a.pontos).slice(0,parseInt(limit)).map((a,i)=>({rank:i+1,...a}));
    return {total:ranking.length,ranking};
  });

  // ANALISE DE SAUDE PREMIUM
  fastify.get('/athletes/:id/health', async(req,reply)=>{
    const {id}=req.params;
    const athlete=await prisma.athlete.findUnique({where:{id}});
    if(!athlete) return reply.code(404).send({error:'Atleta não encontrado'});
    const results=await prisma.result.findMany({where:{athleteId:id},include:{race:{select:{name:true,date:true}}},orderBy:{race:{date:'asc'}}});
    const cardiac=analyzeCardiacRisk(results);
    const distCount={};
    results.forEach(r=>{distCount[r.distance]=(distCount[r.distance]||0)+1;});
    const bestTimes={};
    results.forEach(r=>{
      if(!bestTimes[r.distance]||r.time<bestTimes[r.distance].time)
        bestTimes[r.distance]={time:r.time,pace:r.pace,race:r.race?.name,date:r.race?.date};
    });
    return {
      athlete:{id:athlete.id,name:athlete.name,age:athlete.age,gender:athlete.gender,city:athlete.city,state:athlete.state},
      stats:{totalRaces:results.length,distancesRun:distCount,bestTimes},
      cardiacRisk:cardiac,
      premium:{
        available:true,
        features:['Análise de risco cardíaco','Evolução de pace','Recordes pessoais','Comparação com atletas da cidade','Dicas de treino personalizadas']
      }
    };
  });

  // MERGE DUPLICATAS
  fastify.post('/scraper/merge-athletes', async(req,reply)=>{
    const key=req.headers['x-api-key'];
    if(key!==(process.env.ADMIN_API_KEY||'pace-admin-2026')) return reply.code(401).send({error:'Não autorizado'});
    const athletes=await prisma.athlete.findMany();
    let merged=0;
    const toDelete=new Set();
    for(let i=0;i<athletes.length;i++){
      if(toDelete.has(athletes[i].id)) continue;
      for(let j=i+1;j<athletes.length;j++){
        if(toDelete.has(athletes[j].id)) continue;
        const a=athletes[i],b=athletes[j];
        if(a.gender!==b.gender) continue;
        let score=nameSimilarity(a.name,b.name)*40;
        if(a.city&&b.city&&normalizeName(a.city)===normalizeName(b.city)) score+=30;
        if(a.age&&b.age&&Math.abs(a.age-b.age)<=1) score+=30;
        if(score>=80){
          const[cA,cB]=await Promise.all([prisma.result.count({where:{athleteId:a.id}}),prisma.result.count({where:{athleteId:b.id}})]);
          const keep=cA>=cB?a:b,remove=cA>=cB?b:a;
          await prisma.result.updateMany({where:{athleteId:remove.id},data:{athleteId:keep.id}});
          toDelete.add(remove.id);merged++;
        }
      }
    }
    for(const id of toDelete) await prisma.athlete.delete({where:{id}}).catch(()=>{});
    return {success:true,merged,deleted:toDelete.size};
  });
}
