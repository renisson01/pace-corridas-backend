import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import jwt from 'jsonwebtoken';
const prisma = new PrismaClient();
const JWT = process.env.JWT_SECRET || 'pace-2026';

function getUser(req) {
  try { return jwt.verify(req.headers.authorization?.replace('Bearer ',''), JWT); }
  catch { return null; }
}
async function isAdmin(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  return u?.isAdmin || false;
}

export async function assessoriaRoutes(fastify) {
  // Listar todas
  fastify.get('/assessorias', async (req) => {
    const { estado, q } = req.query;
    const where = { ativo: true };
    if (estado) where.estado = estado;
    if (q) where.nome = { contains: q, mode: 'insensitive' };
    return prisma.assessoria.findMany({
      where, orderBy: { nome: 'asc' },
      include: { _count: { select: { produtos: true } } }
    });
  });

  // Buscar por slug
  fastify.get('/assessorias/:slug', async (req, reply) => {
    const a = await prisma.assessoria.findUnique({
      where: { slug: req.params.slug },
      include: {
        produtos: { where: { ativo: true }, orderBy: { createdAt: 'desc' } },
        _count: { select: { produtos: true } }
      }
    });
    if (!a) return reply.code(404).send({ error: 'Não encontrada' });
    return a;
  });

  // ADMIN - Criar assessoria
  fastify.post('/assessorias', async (req, reply) => {
    const u = getUser(req);
    if (!u || !await isAdmin(u.userId)) return reply.code(403).send({ error: 'Apenas admin' });
    const { nome, cidade, estado, descricao, logo, instagram, whatsapp, site, fundacao } = req.body;
    const slug = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    return prisma.assessoria.create({ data: { nome, cidade, estado, descricao, logo, instagram, whatsapp, site, fundacao, slug } });
  });

  // ADMIN - Atualizar assessoria
  fastify.patch('/assessorias/:id', async (req, reply) => {
    const u = getUser(req);
    if (!u || !await isAdmin(u.userId)) return reply.code(403).send({ error: 'Apenas admin' });
    return prisma.assessoria.update({ where: { id: req.params.id }, data: req.body });
  });
}
