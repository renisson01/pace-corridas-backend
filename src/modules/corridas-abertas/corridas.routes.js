import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function corridasAbertasRoutes(fastify) {

  // LISTAR CORRIDAS ABERTAS
  fastify.get('/corridas-abertas', async (req) => {
    const { estado, distancia, mes, limit } = req.query;
    const where = { ativa: true, data: { gte: new Date() } };
    if (estado) where.estado = estado;
    if (distancia) where.distancias = { contains: distancia };
    if (mes) {
      const ano = new Date().getFullYear();
      const mesNum = parseInt(mes);
      where.data = { gte: new Date(ano, mesNum - 1, 1), lt: new Date(ano, mesNum, 1) };
    }

    return prisma.corridaAberta.findMany({
      where,
      orderBy: { data: 'asc' },
      take: parseInt(limit) || 50
    });
  });

  // DETALHES
  fastify.get('/corridas-abertas/:id', async (req, reply) => {
    const corrida = await prisma.corridaAberta.findUnique({ where: { id: req.params.id } });
    if (!corrida) return reply.code(404).send({ error: 'Corrida não encontrada' });
    return corrida;
  });

  // ADICIONAR CORRIDA (admin)
  fastify.post('/corridas-abertas', async (req, reply) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== (process.env.ADMIN_KEY || 'pace-admin-2026')) {
      return reply.code(403).send({ error: 'Acesso negado' });
    }
    const { nome, data, cidade, estado, distancias, linkInscricao, fonte, preco, organizador, imageUrl } = req.body || {};
    if (!nome || !data || !cidade || !estado || !linkInscricao) {
      return reply.code(400).send({ error: 'Campos obrigatórios: nome, data, cidade, estado, linkInscricao' });
    }
    const corrida = await prisma.corridaAberta.create({
      data: { nome, data: new Date(data), cidade, estado, distancias: distancias || '', linkInscricao, fonte, preco: preco ? parseFloat(preco) : null, organizador, imageUrl }
    });
    return corrida;
  });
}
