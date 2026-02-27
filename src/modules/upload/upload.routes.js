export async function uploadRoutes(fastify) {
  fastify.post('/upload', async (req, reply) => {
    return { success: true, message: 'Upload endpoint ativo' };
  });
}
