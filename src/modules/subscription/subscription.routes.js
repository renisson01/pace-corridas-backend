import pkg from '@prisma/client';
const { PrismaClient } = pkg;
export async function subscriptionRoutes(fastify){
  fastify.post('/subscription/coach/calcular',async(req)=>{const count=parseInt(req.body.atletasAtivos)||0;const m=count*3.99;return{atletasAtivos:count,valorPorAtleta:3.99,mensalidade:Math.round(m*100)/100,adesao:99.00,exemplo:count+' atletas x R$3,99 = R$'+m.toFixed(2)+'/mes'}});
  fastify.get('/subscription/planos',async()=>({treinador:{adesao:99.00,porAtleta:3.99,desc:'Adesao unica R$99 + R$3,99/atleta/mes'},premium:{mensal:4.99,desc:'IA treinadora + funcoes premium'}}));
}
