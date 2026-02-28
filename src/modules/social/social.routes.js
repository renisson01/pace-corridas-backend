import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
const prisma = new PrismaClient();
const JWT = process.env.JWT_SECRET || 'pace-secret-2026';

function getUser(req) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    return jwt.verify(token, JWT);
  } catch { return null; }
}

export async function socialRoutes(fastify) {

  // GET /social/posts — feed principal
  fastify.get('/posts', async (req) => {
    const u = getUser(req);
    const posts = await prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        user: { select: { id:true, name:true } },
        _count: { select: { likes:true, comments:true } },
        likes: u ? { where: { userId: u.userId }, select: { userId:true } } : false,
      }
    });
    return posts.map(p => ({
      ...p,
      likesCount: p._count.likes,
      commentsCount: p._count.comments,
      likedByMe: u ? p.likes?.some(l => l.userId === u.userId) : false,
    }));
  });

  // POST /social/posts — criar post
  fastify.post('/posts', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { content, tipo, imageUrl } = req.body || {};
    if (!content?.trim()) return reply.code(400).send({ error: 'Conteúdo obrigatório' });
    const post = await prisma.post.create({
      data: { content, tipo: tipo||'geral', imageUrl: imageUrl||null, userId: u.userId },
      include: { user: { select: { id:true, name:true } } }
    });
    return post;
  });

  // POST /social/posts/:id/like
  fastify.post('/posts/:id/like', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const postId = req.params.id;
    const existe = await prisma.postLike.findUnique({
      where: { userId_postId: { userId: u.userId, postId } }
    });
    if (existe) {
      await prisma.postLike.delete({ where: { userId_postId: { userId: u.userId, postId } } });
    } else {
      await prisma.postLike.create({ data: { userId: u.userId, postId } });
    }
    const likes = await prisma.postLike.count({ where: { postId } });
    return { likes, liked: !existe };
  });

  // POST /social/posts/:id/comment
  fastify.post('/posts/:id/comment', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const { content } = req.body || {};
    if (!content?.trim()) return reply.code(400).send({ error: 'Comentário vazio' });
    const comment = await prisma.comment.create({
      data: { content, userId: u.userId, postId: req.params.id },
      include: { user: { select: { id:true, name:true } } }
    });
    return comment;
  });

  // POST /social/follow/:targetId
  fastify.post('/follow/:targetId', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const targetId = req.params.targetId;
    const existe = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: u.userId, followingId: targetId } }
    });
    if (existe) {
      await prisma.follow.delete({ where: { followerId_followingId: { followerId: u.userId, followingId: targetId } } });
      return { seguindo: false };
    }
    await prisma.follow.create({ data: { followerId: u.userId, followingId: targetId } });
    return { seguindo: true };
  });

  // GET /social/users/:id/profile
  fastify.get('/users/:id/profile', async (req) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { followers:true, following:true, posts:true } },
        posts: { orderBy: { createdAt:'desc' }, take:12,
          include: { _count: { select: { likes:true, comments:true } } } }
      }
    });
    return user;
  });

  // GET /social/my/medals
  fastify.get('/my/medals', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Não autorizado' });
    const medals = await prisma.medal.findMany({ where: { userId: u.userId } });
    return medals;
  });
}
