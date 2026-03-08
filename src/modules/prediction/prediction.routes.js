import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();
function tps(t){if(typeof t==='number')return t;if(!t)return 0;const p=t.split(':').map(Number);if(p.length===3)return p[0]*3600+p[1]*60+p[2];if(p.length===2)return p[0]*60+p[1];return 0}
function spt(s){const h=Math.floor(s/3600);const m=Math.floor((s%3600)/60);const sc=Math.round(s%60);if(h>0)return h+':'+String(m).padStart(2,'0')+':'+String(sc).padStart(2,'0');return m+':'+String(sc).padStart(2,'0')}
function riegel(t1,d1,d2){return t1*Math.pow(d2/d1,1.06)}
export async function predictionRoutes(fastify){
  fastify.post('/prediction',async(req)=>{const{distance,time}=req.body;const t1=tps(time);const d1=parseFloat(distance);const dists=[3,5,10,15,21.1,42.2];const p={};for(const d2 of dists){if(Math.abs(d2-d1)<0.5)continue;const t2=riegel(t1,d1,d2);const l=d2===21.1?'meia':d2===42.2?'maratona':d2+'km';p[l]={distancia:d2,tempo:spt(t2),pace:spt(t2/d2)}}return{distanciaBase:d1,tempoBase:spt(t1),previsoes:p}});
  fastify.get('/prediction/atleta/:id',async(req)=>{const{id}=req.params;const results=await prisma.result.findMany({where:{athleteId:id},include:{race:true},orderBy:{time:'asc'}});if(!results.length)return{error:'Sem resultados'};const b=results[0];const dist=parseFloat((b.distance||'').replace(/[^0-9.]/g,''));const t1=tps(b.time);if(!dist||!t1)return{error:'Dados insuficientes'};const dists=[3,5,10,15,21.1,42.2];const p={};for(const d2 of dists){const t2=riegel(t1,dist,d2);const l=d2===21.1?'meia':d2===42.2?'maratona':d2+'km';p[l]={distancia:d2,tempo:spt(t2),pace:spt(t2/d2)}}return{atleta:b.athlete?.name||id,melhorProva:b.race?.name,previsoes:p}});
}
