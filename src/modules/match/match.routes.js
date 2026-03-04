export async function matchRoutes(fastify) {
  fastify.get('/match', async (req, reply) => {
    return reply.redirect('/amigo-pace/sugestoes');
  });
}
