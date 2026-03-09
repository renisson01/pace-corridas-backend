export async function matchRoutes(fastify) {
  fastify.get('/match', async (req, reply) => {
    return reply.redirect('/amigo-pace/sugestoes');
// ADICIONAR estas rotas no arquivo:
// ~/pace-corridas-backend/src/modules/match/match.routes.js
// Cole ANTES do último fechamento de função (antes do último "}")

  // ─── PALPITES X1 (compartilhados entre todos usuários) ───────────────────
  // Armazena em memória do servidor (reseta ao reiniciar)
  // Para persistir: trocar pelo banco depois
  const palpitesX1 = { tiago: 0, pedrinho: 0 };

  fastify.get('/match/x1/palpites', async (req, reply) => {
    return reply.send(palpitesX1);
  });

  fastify.post('/match/x1/palpites', async (req, reply) => {
    const { atleta } = req.body || {};
    if (atleta === 'tiago' || atleta === 'pedrinho' || atleta === 'pedro') {
      const chave = atleta === 'pedro' ? 'pedrinho' : atleta;
      palpitesX1[chave] = (palpitesX1[chave] || 0) + 1;
    }
    return reply.send(palpitesX1);
  });
}
