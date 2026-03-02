import pkg from '@prisma/client';
const { PrismaClient } = pkg;
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

function normName(n){
  return n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z\s]/g,'').trim();
}

function nameSim(a,b){
  const na=normName(a).split(' '),nb=normName(b).split(' ');
  if(na[0]===nb[0]&&na[na.length-1]===nb[nb.length-1]) return 1;
  if(na[0]===nb[0]) return 0.7;
  if(na[na.length-1]===nb[nb.length-1]) return 0.6;
  return 0;
}

async function findOrCreate(data){
  const{name,age,gender,city,state}=data;
  const candidates=await prisma.athlete.findMany({where:{gender:gender||'M'},take:500});
  let best=null,bs=0;
  for(const c of candidates){
    let s=nameSim(name,c.name)*40;
    if(city&&c.city&&normName(city)===normName(c.city)) s+=30;
    if(age&&c.age&&Math.abs(age-c.age)<=2) s+=20;
    if(s>bs){bs=s;best=c;}
  }
  if(best&&bs>=70) return{athlete:best,isNew:false};
  const a=await prisma.athlete.create({data:{name,age:age||0,gender:gender||'M',city:city||'',state:state||''}});
  return{athlete:a,isNew:true};
}

export async function scraperRoutes(fastify){

  fastify.get('/scraper/status', async()=>{
    const [totalRaces,totalResults,athletes]=await Promise.all([
      prisma.race.count(),
      prisma.result.count(),
      prisma.athlete.count()
    ]);
    return{status:'online',totalRaces,totalResults,athletes};
  });

  fastify.post('/scraper/import', async(req,reply)=>{
    const{raceId,distance,results}=req.body;
    if(!raceId||!results||!Array.isArray(results))
      return reply.code(400).send({error:'Envie raceId, distance, results[]'});
    const race=await prisma.race.findUnique({where:{id:raceId}});
    if(!race) return reply.code(404).send({error:'Corrida nao encontrada'});
    let ok=0,err=0;
    for(const r of results){
      try{
        const{athlete}=await findOrCreate({name:r.name,age:r.age,gender:r.gender,city:r.city||race.city,state:r.state||race.state});
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
    return{success:true,inseridos:ok,erros:err,raceName:race.name};
  });

  fastify.post('/scraper/merge-athletes', async(req,reply)=>{
    const key=req.headers['x-api-key'];
    if(key!==(process.env.ADMIN_API_KEY||'pace-admin-2026'))
      return reply.code(401).send({error:'Nao autorizado'});
    const athletes=await prisma.athlete.findMany();
    let merged=0;
    const toDelete=new Set();
    for(let i=0;i<athletes.length;i++){
      if(toDelete.has(athletes[i].id)) continue;
      for(let j=i+1;j<athletes.length;j++){
        if(toDelete.has(athletes[j].id)) continue;
        const a=athletes[i],b=athletes[j];
        if(a.gender!==b.gender) continue;
        let score=nameSim(a.name,b.name)*40;
        if(a.city&&b.city&&normName(a.city)===normName(b.city)) score+=30;
        if(a.age&&b.age&&Math.abs(a.age-b.age)<=1) score+=30;
        if(score>=80){
          const[cA,cB]=await Promise.all([
            prisma.result.count({where:{athleteId:a.id}}),
            prisma.result.count({where:{athleteId:b.id}})
          ]);
          const keep=cA>=cB?a:b,remove=cA>=cB?b:a;
          await prisma.result.updateMany({where:{athleteId:remove.id},data:{athleteId:keep.id}});
          toDelete.add(remove.id);
          merged++;
        }
      }
    }
    for(const id of toDelete) await prisma.athlete.delete({where:{id}}).catch(()=>{});
    return{success:true,merged,deleted:toDelete.size};
  });
}
