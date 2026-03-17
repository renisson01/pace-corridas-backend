import prisma from '../lib/prisma.js';
function divisao(pts){if(pts>=200)return{nome:'Diamante',icone:'💎'};if(pts>=120)return{nome:'Ouro',icone:'🥇'};if(pts>=60)return{nome:'Prata',icone:'🥈'};if(pts>=20)return{nome:'Bronze',icone:'🥉'};return{nome:'Iniciante',icone:'🌱'}}
export async function leagueRoutes(fastify){
  fastify.get('/league/ranking',async(req)=>{const{estado,genero,faixa}=req.query;const where={};if(estado)where.state=estado;if(genero)where.gender=genero;const a=await prisma.athlete.findMany({where,orderBy:{totalPoints:'desc'},take:100,select:{id:true,name:true,state:true,gender:true,age:true,totalPoints:true,totalRaces:true,equipe:true}});let l=a;if(faixa){l=l.filter(x=>{if(!x.age)return false;if(faixa==='SUB20')return x.age<20;if(faixa==='60+')return x.age>=60;const[mn,mx]=faixa.split('-').map(Number);return x.age>=mn&&x.age<=mx})}return l.map((x,i)=>({posicao:i+1,...x,divisao:divisao(x.totalPoints)}))});
  fastify.get('/league/divisoes',async()=>[{nome:'Diamante',icone:'💎',pontosMin:200},{nome:'Ouro',icone:'🥇',pontosMin:120},{nome:'Prata',icone:'🥈',pontosMin:60},{nome:'Bronze',icone:'🥉',pontosMin:20},{nome:'Iniciante',icone:'🌱',pontosMin:0}]);
}
