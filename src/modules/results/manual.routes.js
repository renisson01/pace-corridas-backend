import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma.js';

const JWT = process.env.JWT_SECRET || 'pace-secret-2026';

function getUser(req) {
  try { return jwt.verify(req.headers.authorization?.replace('Bearer ', ''), JWT); }
  catch { return null; }
}

function normDist(d) {
  const n = parseFloat(String(d || '5').replace(/[^0-9.]/g, ''));
  if (n >= 40) return '42K'; if (n >= 20) return '21K'; if (n >= 14) return '15K';
  if (n >= 12) return '12K'; if (n >= 9) return '10K'; if (n >= 7.5) return '8K';
  if (n >= 6.5) return '7K'; if (n >= 5.5) return '6K'; if (n >= 4) return '5K'; return '3K';
}

const DIST_KM = { '42K': 42, '21K': 21, '15K': 15, '12K': 12, '10K': 10, '8K': 8, '7K': 7, '6K': 6, '5K': 5, '3K': 3 };

function calcPace(time, distStr) {
  if (!time || !distStr) return null;
  const km = DIST_KM[distStr] || parseFloat(distStr);
  if (!km) return null;
  const parts = time.split(':').map(Number);
  if (parts.length !== 3) return null;
  const secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (!secs) return null;
  const ps = secs / km;
  return `${Math.floor(ps / 60)}:${String(Math.round(ps % 60)).padStart(2, '0')}`;
}

function validTime(t) {
  return typeof t === 'string' && /^\d{1,2}:\d{2}:\d{2}$/.test(t);
}

export async function manualResultRoutes(fastify) {

  // PUT /api/resultados/:id/editar — editar resultado do atleta logado
  fastify.put('/api/resultados/:id/editar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Token obrigatório' });

    const user = await prisma.user.findUnique({
      where: { id: u.userId },
      select: { athleteId: true }
    });
    if (!user?.athleteId) return reply.code(400).send({ error: 'Sem atleta vinculado' });

    const result = await prisma.result.findUnique({
      where: { id: req.params.id },
      include: { race: true }
    });
    if (!result) return reply.code(404).send({ error: 'Resultado não encontrado' });
    if (result.athleteId !== user.athleteId) return reply.code(403).send({ error: 'Sem permissão' });

    const { raceName, distance, time, pace, overallRank, genderRank, ageGroup, raceCity, raceState } = req.body || {};

    if (time && !validTime(time)) return reply.code(400).send({ error: 'Formato de tempo inválido. Use HH:MM:SS' });

    // Salva estado original (apenas na primeira edição)
    const originalData = result.originalData || JSON.stringify({
      time: result.time,
      pace: result.pace,
      distance: result.distance,
      overallRank: result.overallRank,
      genderRank: result.genderRank,
      ageGroup: result.ageGroup,
    });

    const newDist   = distance ? normDist(distance) : result.distance;
    const newTime   = time     || result.time;
    const newPace   = pace     || (time || distance ? calcPace(newTime, newDist) : result.pace);

    const updateData = {
      editedByAthlete: true,
      originalData,
      time: newTime,
      pace: newPace,
      distance: newDist,
    };
    if (overallRank !== undefined) updateData.overallRank = overallRank ? parseInt(overallRank) : null;
    if (genderRank  !== undefined) updateData.genderRank  = genderRank  ? parseInt(genderRank)  : null;
    if (ageGroup    !== undefined) updateData.ageGroup    = ageGroup    || null;

    // Atualizar nome/local da corrida se fornecido
    if (raceName || raceCity || raceState) {
      const raceUpdate = {};
      if (raceName)  raceUpdate.name  = raceName;
      if (raceCity)  raceUpdate.city  = raceCity;
      if (raceState) raceUpdate.state = raceState;
      await prisma.race.update({ where: { id: result.raceId }, data: raceUpdate });
    }

    const updated = await prisma.result.update({
      where: { id: req.params.id },
      data: updateData,
      include: { race: { select: { name: true, date: true, city: true, state: true } } }
    });

    return {
      success: true,
      result: {
        id: updated.id,
        prova: updated.race.name,
        data: updated.race.date,
        distance: updated.distance,
        time: updated.time,
        pace: updated.pace,
        overallRank: updated.overallRank,
        genderRank: updated.genderRank,
        ageGroup: updated.ageGroup,
        editedByAthlete: updated.editedByAthlete,
        originalData: JSON.parse(updated.originalData),
      }
    };
  });

  // POST /api/resultados/manual — adicionar resultado manual
  fastify.post('/api/resultados/manual', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Token obrigatório' });

    const user = await prisma.user.findUnique({
      where: { id: u.userId },
      select: { athleteId: true, name: true, gender: true, state: true }
    });
    if (!user?.athleteId) return reply.code(400).send({ error: 'Sem atleta vinculado. Vincule seu perfil primeiro.' });

    const { raceName, raceDate, raceCity, raceState, distance, time, overallRank, ageGroup } = req.body || {};

    if (!raceName) return reply.code(400).send({ error: 'raceName obrigatório' });
    if (!raceDate) return reply.code(400).send({ error: 'raceDate obrigatório (YYYY-MM-DD)' });
    if (!distance) return reply.code(400).send({ error: 'distance obrigatório' });
    if (!time)     return reply.code(400).send({ error: 'time obrigatório (HH:MM:SS)' });
    if (!validTime(time)) return reply.code(400).send({ error: 'Formato de tempo inválido. Use HH:MM:SS' });

    const dist = normDist(distance);
    const pace = calcPace(time, dist);

    let dateObj;
    try { dateObj = new Date(raceDate); if (isNaN(dateObj)) throw new Error(); }
    catch { return reply.code(400).send({ error: 'raceDate inválido. Use YYYY-MM-DD' }); }

    // Buscar corrida existente por nome + data (tolerante: mesmo nome no mesmo dia)
    let race = await prisma.race.findFirst({
      where: {
        name: { equals: raceName, mode: 'insensitive' },
        date: dateObj,
      }
    });

    if (!race) {
      race = await prisma.race.create({
        data: {
          name: raceName,
          date: dateObj,
          city:  raceCity  || '',
          state: raceState || 'BR',
          distances: dist,
          organizer: 'manual',
          status: 'completed',
        }
      });
    }

    // Verificar se atleta já tem resultado nessa corrida
    const existing = await prisma.result.findUnique({
      where: { athleteId_raceId: { athleteId: user.athleteId, raceId: race.id } }
    });
    if (existing) {
      return reply.code(409).send({ error: 'Você já tem um resultado nessa corrida. Use PUT /api/resultados/:id/editar para corrigir.' });
    }

    const result = await prisma.result.create({
      data: {
        id: `man_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        athleteId: user.athleteId,
        raceId: race.id,
        time,
        pace,
        distance: dist,
        overallRank: overallRank ? parseInt(overallRank) : null,
        ageGroup:    ageGroup    || null,
        source:      'manual',
        points:      0,
      },
      include: { race: { select: { name: true, date: true, city: true, state: true } } }
    });

    return reply.code(201).send({
      success: true,
      result: {
        id: result.id,
        prova: result.race.name,
        data: result.race.date,
        cidade: result.race.city,
        estado: result.race.state,
        distance: result.distance,
        time: result.time,
        pace: result.pace,
        overallRank: result.overallRank,
        ageGroup: result.ageGroup,
        source: result.source,
      }
    });
  });
}
