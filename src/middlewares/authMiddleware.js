
import crypto from 'crypto';

export function generateToken(athleteId) {
  const payload = { id:athleteId, exp:Date.now()+7*24*60*60*1000 };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function verifyToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token,'base64url').toString());
    if(payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

export async function authMiddleware(req, reply) {
  const auth = req.headers.authorization;
  if(!auth || !auth.startsWith('Bearer ')) {
    return reply.code(401).send({ error:'Token obrigatório' });
  }
  const token = auth.replace('Bearer ','');
  const payload = verifyToken(token);
  if(!payload) return reply.code(401).send({ error:'Token inválido ou expirado' });
  req.athleteId = payload.id;
}
