import { decideNextAction } from './decision.engine.js';
import { generateSaunaProtocol } from '../interventions/sauna.service.js';
import { generateTrainingRecommendation } from '../interventions/training.service.js';
import jwt from 'jsonwebtoken';

function getUser(req) {
  try { return jwt.verify(req.headers.authorization?.replace('Bearer ',''), process.env.JWT_SECRET || 'pace-secret-2026'); }
  catch { return null; }
}

export async function decisionRoutes(fastify) {
  fastify.post('/decision/next-step', async (req, reply) => {
    const u = getUser(req); if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try { return await decideNextAction(u.userId, req.body || {}); }
    catch(e) { return reply.code(500).send({ error: 'Erro no motor de decisão', detail: e.message }); }
  });

  fastify.post('/intervention/sauna', async (req, reply) => {
    const u = getUser(req); if (!u) return reply.code(401).send({ error: 'Login necessário' });
    return generateSaunaProtocol(req.body || {});
  });

  fastify.post('/intervention/training', async (req, reply) => {
    const u = getUser(req); if (!u) return reply.code(401).send({ error: 'Login necessário' });
    return generateTrainingRecommendation(req.body || {});
  });
}
