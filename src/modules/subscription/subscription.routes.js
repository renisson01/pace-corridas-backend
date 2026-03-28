import prisma from '../../lib/prisma.js';
export async function subscriptionRoutes(fastify) {

  // POST /subscription/coach/calcular — calcula mensalidade do treinador
  fastify.post('/subscription/coach/calcular', async (req) => {
    const count = parseInt(req.body?.atletasAtivos) || 0;
    const m = count * 3.99;
    return {
      atletasAtivos: count,
      valorPorAtleta: 3.99,
      mensalidade: Math.round(m * 100) / 100,
      adesao: 99.90,
      exemplo: `${count} atletas x R$3,99 = R$${m.toFixed(2)}/mês`
    };
  });

  // GET /subscription/planos — lista todos os planos
  fastify.get('/subscription/planos', async () => ({
    treinador: {
      adesao: 99.90,
      porAtleta: 3.99,
      desc: 'Adesão única R$99,90 + R$3,99/atleta/mês'
    },
    iaTreinadora: {
      mensal: 9.99,
      desc: 'IA Treinadora REGENI — planilha personalizada + chat ilimitado + análise completa'
    }
  }));
}
