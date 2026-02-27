import { registrar, login, recuperarComBIP39, gerarBIP39 } from '../../services/authService.js';

export async function authRoutes(fastify) {

  // REGISTRO
  fastify.post('/auth/register', async (req, reply) => {
    try {
      const result = await registrar(req.body);
      return reply.code(201).send({ success: true, ...result });
    } catch(e) {
      return reply.code(400).send({ success: false, error: e.message });
    }
  });

  // LOGIN
  fastify.post('/auth/login', async (req, reply) => {
    try {
      const result = await login(req.body);
      return { success: true, ...result };
    } catch(e) {
      return reply.code(401).send({ success: false, error: e.message });
    }
  });

  // RECUPERAÇÃO COM BIP39
  fastify.post('/auth/recover', async (req, reply) => {
    try {
      const result = await recuperarComBIP39(req.body);
      return { success: true, ...result };
    } catch(e) {
      return reply.code(400).send({ success: false, error: e.message });
    }
  });

  // ME (perfil autenticado)
  fastify.get('/auth/me', async (req, reply) => {
    try {
      const auth = req.headers.authorization?.replace('Bearer ','');
      if(!auth) return reply.code(401).send({ error: 'Não autenticado' });
      const { verificarToken } = await import('../../services/authService.js');
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const payload = verificarToken(auth);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id:true, email:true, name:true, city:true, state:true, gender:true, age:true, isPremium:true, createdAt:true }
      });
      await prisma.$disconnect();
      if(!user) return reply.code(404).send({ error: 'Usuário não encontrado' });
      return { success: true, user };
    } catch(e) {
      return reply.code(401).send({ error: e.message });
    }
  });
}
