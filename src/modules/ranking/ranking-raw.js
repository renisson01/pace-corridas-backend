/**
 * Ranking query sem ORM complexity — SQL direto
 * Zero AI, zero latência
 */
import prisma from '../../lib/prisma.js';

function tempoParaSegundos(t) {
  if (!t || t === 'DNS') return 999999;
  const parts = t.split(':').map(Number);
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  if (parts.length === 2) return parts[0]*60 + parts[1];
  return 999999;
}

function nivelAtleta(pts) {
  if (pts >= 12000) return '⭐ Elite Mundial';
  if (pts >= 7000)  return '🔥 Elite Nacional';
  if (pts >= 3000)  return '💪 Elite Regional';
  if (pts >= 1000)  return '📈 Sub-Elite';
  return '🌱 Avançado';
}

export async function getRankingFor(distance, gender = null) {
  try {
    // Raw SQL — get city from Race via Result
    const sql = `
      SELECT 
        a.id, a.name, a.equipe, a.state, a.gender, a."totalPoints",
        MIN(r.time) as "melhorTempo",
        (SELECT "city" FROM "Race" WHERE id = r."raceId" LIMIT 1) as "city"
      FROM "Athlete" a
      JOIN "Result" r ON a.id = r."athleteId"
      WHERE r.distance = $1
        ${gender ? 'AND a.gender = $2' : ''}
      GROUP BY a.id, a.name, a.equipe, a.state, a.gender, a."totalPoints", r."raceId"
      ORDER BY MIN(r."time") ASC
      LIMIT 5000
    `;
    
    const params = [distance];
    if (gender) params.push(gender);
    
    const results = await prisma.$queryRawUnsafe(sql, ...params);
    
    return results.map((r, i) => ({
      posicao: i + 1,
      id: r.id,
      name: r.name,
      equipe: r.equipe || null,
      state: r.state || null,
      city: r.city || null,
      gender: r.gender,
      totalPoints: r.totalPoints,
      nivel: nivelAtleta(r.totalPoints),
      melhorTempo: r.melhorTempo
    }));
  } catch (err) {
    console.error('Ranking error:', err.message);
    return [];
  }
}
