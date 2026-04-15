import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma.js';

const JWT = process.env.JWT_SECRET || 'pace-secret-2026';

function getUser(req) {
  try { return jwt.verify(req.headers.authorization?.replace('Bearer ', ''), JWT); }
  catch { return null; }
}

export async function perfilRoutes(fastify) {

  // GET /api/perfil — retorna perfil do atleta logado
  fastify.get('/api/perfil', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Token obrigatório' });

    const user = await prisma.user.findUnique({
      where: { id: u.userId },
      include: {
        athlete: {
          include: {
            results: {
              orderBy: { createdAt: 'desc' },
              take: 10,
              include: { race: { select: { name: true, date: true, city: true, state: true } } }
            }
          }
        }
      }
    });
    if (!user) return reply.code(404).send({ error: 'Usuário não encontrado' });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      gender: user.gender,
      age: user.age,
      city: user.city,
      state: user.state,
      isPremium: user.isPremium,
      athlete: user.athlete ? {
        id: user.athlete.id,
        name: user.athlete.name,
        city: user.athlete.city || null,
        state: user.athlete.state || null,
        club: user.athlete.club || null,
        coach: user.athlete.coach || null,
        photoUrl: user.athlete.photoUrl || null,
        bio: user.athlete.bio || null,
        totalRaces: user.athlete.totalRaces,
        totalPoints: user.athlete.totalPoints,
        ultimosResultados: user.athlete.results.map(r => ({
          id: r.id,
          prova: r.race.name,
          data: r.race.date,
          cidade: r.race.city,
          estado: r.race.state,
          distance: r.distance,
          time: r.time,
          pace: r.pace,
          overallRank: r.overallRank,
          source: r.source || 'scraper',
          editedByAthlete: r.editedByAthlete,
        }))
      } : null
    };
  });

  // PUT /api/perfil/atualizar — atualiza campos do Athlete vinculado
  fastify.put('/api/perfil/atualizar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Token obrigatório' });

    const user = await prisma.user.findUnique({
      where: { id: u.userId },
      select: { id: true, athleteId: true }
    });
    if (!user) return reply.code(404).send({ error: 'Usuário não encontrado' });
    if (!user.athleteId) return reply.code(400).send({ error: 'Usuário sem atleta vinculado. Complete seu perfil primeiro.' });

    const { city, state, club, coach, photoUrl, bio } = req.body || {};

    const data = {};
    if (city     !== undefined) data.city     = city     || null;
    if (state    !== undefined) data.state    = state    || null;
    if (club     !== undefined) data.club     = club     || null;
    if (coach    !== undefined) data.coach    = coach    || null;
    if (photoUrl !== undefined) data.photoUrl = photoUrl || null;
    if (bio      !== undefined) data.bio      = bio      || null;

    if (!Object.keys(data).length) {
      return reply.code(400).send({ error: 'Nenhum campo para atualizar' });
    }

    const athlete = await prisma.athlete.update({
      where: { id: user.athleteId },
      data,
      select: { id: true, name: true, city: true, state: true, club: true, coach: true, photoUrl: true, bio: true }
    });

    return { success: true, athlete };
  });
}
