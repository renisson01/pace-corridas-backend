
export async function adminMiddleware(req, reply) {
  const key = req.headers['x-api-key'];
  if(key !== (process.env.ADMIN_API_KEY||'pace-admin-2026')) {
    return reply.code(401).send({ error:'Acesso negado' });
  }
}
