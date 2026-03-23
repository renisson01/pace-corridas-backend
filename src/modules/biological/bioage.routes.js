import * as svc from './bioage.service.js';
import jwt from 'jsonwebtoken';

function getUser(req) {
  try { return jwt.verify(req.headers.authorization?.replace('Bearer ',''), process.env.JWT_SECRET || 'pace-secret-2026'); }
  catch { return null; }
}

export async function bioageRoutes(fastify) {
  fastify.post('/bioage/calculate', async (req, reply) => {
    const u = getUser(req); if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const result = svc.calculateBioAge(req.body);
      const saved = await svc.saveBioAgeRecord(u.userId, result);
      return { ...result, id: saved.id, savedAt: saved.createdAt };
    } catch(e) { return reply.code(400).send({ error: e.message }); }
  });

  fastify.get('/bioage/latest', async (req, reply) => {
    const u = getUser(req); if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const h = await svc.getBioAgeHistory(u.userId, 1);
    return { latest: h[0] ?? null };
  });

  fastify.get('/bioage/history', async (req, reply) => {
    const u = getUser(req); if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const history = await svc.getBioAgeHistory(u.userId, parseInt(req.query?.limit) || 30);
    return { history, total: history.length };
  });

  fastify.get('/bioage/predict', async (req, reply) => {
    const u = getUser(req); if (!u) return reply.code(401).send({ error: 'Login necessário' });
    return await svc.predictBioAge(u.userId);
  });
}
