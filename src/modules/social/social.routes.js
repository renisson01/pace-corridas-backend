import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
const prisma = new PrismaClient();
const JWT = process.env.JWT_SECRET || 'pace-2026';

function getUser(req) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    return jwt.verify(token, JWT);
  } catch { return null; }
}

export async function socialRoutes(fastify) {
  fastify.get('/posts', async (req) => {
    const u = getUser(req);
    try {
      const posts = await prisma.post.findMany({
        orderBy: { createdAt: 'desc' }, take: 30,
        include: {
          user: { select: { id:true, name:true, photo:true, city:true, state:true, isPremium:true } },
          likes: true,
          comments: { include: { user: { select: { id:true, name:true } } }, take: 3 },
          _count: { select: { likes:true, comments:true } }
        }
      });
      return posts.map(p => ({ ...p, likedByMe: u ? p.likes.some(l => l.userId === u.userId) : false, likesCount: p._count.likes, commentsCount: p._count.comments }));
    } catch(e) { return []; }
  });

  fastify.post('/posts', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { content, photo, type, distance, time, pace } = req.body;
    if (!content?.trim()) return reply.code(400).send({ error: 'Conteúdo obrigatório' });
    const post = await prisma.post.create({
      data: { userId: u.userId, content, photo: photo||null, type: type||'post', distance: distance||null, time: time||null, pace: pace||null },
      include: { user: { select: { id:true, name:true, photo:true, city:true, state:true } } }
    });
    await checkMedals(u.userId);
    return post;
  });

  fastify.post('/posts/:id/like', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const existing = await prisma.postLike.findUnique({ where: { userId_postId: { userId: u.userId, postId: req.params.id } } });
    if (existing) { await prisma.postLike.delete({ where: { userId_postId: { userId: u.userId, postId: req.params.id } } }); return { liked: false }; }
    await prisma.postLike.create({ data: { userId: u.userId, postId: req.params.id } });
    return { liked: true };
  });

  fastify.post('/posts/:id/comment', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { content } = req.body;
    if (!content?.trim()) return reply.code(400).send({ error: 'Vazio' });
    return prisma.comment.create({ data: { userId: u.userId, postId: req.params.id, content }, include: { user: { select: { id:true, name:true } } } });
  });

  fastify.post('/follow/:targetId', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    if (u.userId === req.params.targetId) return reply.code(400).send({ error: 'Não pode seguir a si mesmo' });
    const existing = await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: u.userId, followingId: req.params.targetId } } });
    if (existing) { await prisma.follow.delete({ where: { followerId_followingId: { followerId: u.userId, followingId: req.params.targetId } } }); return { following: false }; }
    await prisma.follow.create({ data: { followerId: u.userId, followingId: req.params.targetId } });
    return { following: true };
  });

  fastify.get('/users/:id/profile', async (req) => {
    const u = getUser(req);
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id:true, name:true, photo:true, bio:true, city:true, state:true, isPremium:true, isOrganizer:true,
        athlete: { select: { totalRaces:true, totalPoints:true } },
        _count: { select: { followers:true, following:true, posts:true } },
        medals: { orderBy: { earnedAt: 'desc' } },
        posts: { orderBy: { createdAt: 'desc' }, take: 12, include: { _count: { select: { likes:true, comments:true } } } }
      }
    });
    if (!user) return { error: 'Não encontrado' };
    let isFollowing = false;
    if (u) { const f = await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: u.userId, followingId: req.params.id } } }); isFollowing = !!f; }
    return { ...user, isFollowing };
  });

  fastify.get('/my/medals', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    return prisma.medal.findMany({ where: { userId: u.userId }, orderBy: { earnedAt: 'desc' } });
  });

  fastify.post('/my/photo', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { photo } = req.body;
    await prisma.user.update({ where: { id: u.userId }, data: { photo } });
    return { success: true };
  });

  fastify.patch('/my/profile', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { bio, city, state, age, phone, name } = req.body;
    const user = await prisma.user.update({
      where: { id: u.userId },
      data: { bio: bio||null, city: city||null, state: state||null, age: age ? parseInt(age) : null, phone: phone||null, ...(name && { name }) },
      select: { id:true, name:true, bio:true, city:true, state:true, photo:true, isPremium:true }
    });
    return { success: true, user };
  });
}

async function checkMedals(userId) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { posts:true, athlete:true, medals:true } });
    if (!user) return;
    const existing = user.medals.map(m => m.type);
    const toAdd = [];
    if (user.posts.length >= 1 && !existing.includes('first_post')) toAdd.push({ type:'first_post', title:'Primeira Postagem!', desc:'Você compartilhou seu primeiro momento', icon:'📸' });
    if (user.posts.length >= 5 && !existing.includes('posts_5')) toAdd.push({ type:'posts_5', title:'Comunicador', desc:'5 postagens no feed', icon:'📢' });
    const races = user.athlete?.totalRaces || 0;
    if (races >= 1 && !existing.includes('first_race')) toAdd.push({ type:'first_race', title:'Primeira Corrida!', desc:'Completou sua primeira corrida', icon:'🏃' });
    if (races >= 5 && !existing.includes('races_5')) toAdd.push({ type:'races_5', title:'Corredor', desc:'5 corridas completadas', icon:'⚡' });
    if (races >= 10 && !existing.includes('races_10')) toAdd.push({ type:'races_10', title:'Maratonista', desc:'10 corridas completadas', icon:'🔥' });
    if (races >= 50 && !existing.includes('races_50')) toAdd.push({ type:'races_50', title:'Elite', desc:'50 corridas completadas', icon:'🏆' });
    for (const m of toAdd) await prisma.medal.create({ data: { userId, ...m } });
  } catch(e) { console.error('[MEDALS]', e.message); }
}
