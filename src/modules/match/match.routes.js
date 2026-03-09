import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

export async function matchRoutes(fastify) {

  fastify.get('/match', async (req, reply) => {
    return reply.redirect('/amigo-pace/sugestoes');
  });

  // ─── PALPITES X1 — salvos no banco ────────────────────────────────────────
  // Usa tabela Checkin como fallback se não tiver tabela dedicada
  // Armazena em "tipo" = 'x1_palpite' e "atletaRef" = 'tiago' | 'pedrinho'

  fastify.get('/match/x1/palpites', async (req, reply) => {
    try {
      // Tentar ler da tabela pagamentoRegistro com tipo x1_palpite
      const registros = await prisma.pagamentoRegistro.findMany({
        where: { tipo: 'x1_palpite' },
        select: { atletaRef: true }
      }).catch(() => null);

      if (registros) {
        const tiago    = registros.filter(r => r.atletaRef === 'tiago').length;
        const pedrinho = registros.filter(r => r.atletaRef === 'pedrinho').length;
        return reply.send({ tiago, pedrinho });
      }
    } catch(e) {}

    // Fallback em memória
    if (!globalThis._palpitesX1) globalThis._palpitesX1 = { tiago: 0, pedrinho: 0 };
    return reply.send(globalThis._palpitesX1);
  });

  fastify.post('/match/x1/palpites', async (req, reply) => {
    const { atleta } = req.body || {};
    if (!atleta || !['tiago', 'pedrinho', 'pedro'].includes(atleta)) {
      return reply.code(400).send({ error: 'atleta inválido' });
    }
    const atletaRef = atleta === 'pedro' ? 'pedrinho' : atleta;

    try {
      // Salvar palpite no banco com ID único por timestamp
      await prisma.pagamentoRegistro.create({
        data: {
          paymentId: 'palpite-' + Date.now() + '-' + Math.random().toString(36).slice(2),
          tipo: 'x1_palpite',
          atletaRef,
          valor: 0,
          status: 'palpite'
        }
      }).catch(() => null);

      // Retornar totais atualizados
      const registros = await prisma.pagamentoRegistro.findMany({
        where: { tipo: 'x1_palpite' },
        select: { atletaRef: true }
      }).catch(() => []);

      const tiago    = registros.filter(r => r.atletaRef === 'tiago').length;
      const pedrinho = registros.filter(r => r.atletaRef === 'pedrinho').length;
      return reply.send({ tiago, pedrinho });

    } catch(e) {
      // Fallback memória
      if (!globalThis._palpitesX1) globalThis._palpitesX1 = { tiago: 0, pedrinho: 0 };
      globalThis._palpitesX1[atletaRef] = (globalThis._palpitesX1[atletaRef] || 0) + 1;
      return reply.send(globalThis._palpitesX1);
    }
  });

}
