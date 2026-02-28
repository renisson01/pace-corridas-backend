import jwt from 'jsonwebtoken';
import { verificarResultado, salvarResultadoVerificado } from './result-verifier.js';

const JWT = process.env.JWT_SECRET || 'pace-2026';
function getUser(req) {
  try { return jwt.verify(req.headers.authorization?.replace('Bearer ',''), JWT); }
  catch { return null; }
}

export async function verifyRoutes(fastify) {

  // 1. VERIFICAR URL - retorna dados encontrados para o atleta confirmar
  fastify.post('/results/verify', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const { url, nomeNoResultado } = req.body;
    if (!url) return reply.code(400).send({ error: 'URL obrigatória' });

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const user = await prisma.findUnique({ where: { id: u.userId }, select: { name: true } }).catch(() => null);
    await prisma.$disconnect();

    const nome = nomeNoResultado || user?.name || 'Atleta';
    const resultado = await verificarResultado(url, nome, u.userId);
    return resultado;
  });

  // 2. CONFIRMAR E SALVAR resultado verificado
  fastify.post('/results/confirm', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const { url, tituloProva, distancia, tempo, posicao, pace, estado, cidade } = req.body;
    if (!tempo || !tituloProva) return reply.code(400).send({ error: 'Tempo e prova obrigatórios' });

    try {
      const result = await salvarResultadoVerificado({
        userId: u.userId, tituloProva, distancia, tempo, posicao: parseInt(posicao)||null, pace, url, estado, cidade
      });
      return result;
    } catch(e) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // 3. MEU HISTÓRICO
  fastify.get('/my/results', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      const user = await prisma.user.findUnique({
        where: { id: u.userId },
        include: { athlete: { include: { results: {
          include: { race: { select: { name:true, city:true, state:true, date:true } } },
          orderBy: { createdAt: 'desc' }
        }}}}
      });
      await prisma.$disconnect();
      return user?.athlete?.results || [];
    } catch(e) {
      await prisma.$disconnect();
      return reply.code(500).send({ error: e.message });
    }
  });
}
