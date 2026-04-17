/**
 * Ranking — lê do cache JSON primeiro, fallback para SQL direto
 * Cache gerado por scripts/cache-ranking.cjs a cada 1h
 */
import prisma from '../../lib/prisma.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const CACHE_DIR = '/tmp/regeni-cache';
const CACHE_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2h

function nivelAtleta(pts) {
  if (pts >= 12000) return '⭐ Elite Mundial';
  if (pts >= 7000)  return '🔥 Elite Nacional';
  if (pts >= 3000)  return '💪 Elite Regional';
  if (pts >= 1000)  return '📈 Sub-Elite';
  return '🌱 Avançado';
}

function readCache(distance) {
  const filePath = join(CACHE_DIR, `ranking-${distance}.json`);
  if (!existsSync(filePath)) return null;
  try {
    const cache = JSON.parse(readFileSync(filePath, 'utf8'));
    const age = Date.now() - new Date(cache.generatedAt).getTime();
    if (age > CACHE_MAX_AGE_MS) return null;
    return cache;
  } catch {
    return null;
  }
}

/**
 * Ranking geral por distância — melhor tempo de cada atleta
 * Lê do cache JSON se disponível (<2h), senão calcula ao vivo
 */
export async function getRankingFor(distance, gender = null, limit = 5000) {
  // ── Cache hit ────────────────────────────────────────────
  const cache = readCache(distance);
  if (cache) {
    let data = cache.data;
    if (gender) data = data.filter(r => r.gender === gender).map((r, i) => ({ ...r, posicao: i + 1 }));
    return data.slice(0, limit);
  }

  // ── Cache miss — calcula ao vivo (fallback) ──────────────
  console.warn(`[ranking-raw] Cache miss para ${distance} — calculando ao vivo`);
  try {
    const genderClause = gender ? 'AND a.gender = $2' : '';
    const sql = `
      SELECT DISTINCT ON (a.id)
        a.id, a.name, a.equipe, a.state, a.gender, a."totalPoints",
        r."time" as "melhorTempo",
        race.name as "raceName",
        race.city as "raceCity",
        r."ageGroup"
      FROM "Athlete" a
      JOIN "Result" r ON a.id = r."athleteId"
      JOIN "Race" race ON race.id = r."raceId"
      WHERE replace(upper(r.distance), 'KM', 'K') = $1
        AND r."time" != 'DNS'
        AND r."time" != '00:00:00'
        AND r."time" != ''
        AND a.name IS NOT NULL
        AND a.name != ''
        AND (r."flagged" IS NULL OR r."flagged" = false)
        ${genderClause}
      ORDER BY a.id, r."time" ASC
    `;

    const params = [distance];
    if (gender) params.push(gender);

    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    rows.sort((a, b) => a.melhorTempo.localeCompare(b.melhorTempo));

    return rows.slice(0, limit).map((r, i) => ({
      posicao: i + 1,
      id: r.id,
      name: r.name,
      equipe: r.equipe || null,
      state: r.state || null,
      city: r.raceCity || null,
      gender: r.gender,
      totalPoints: r.totalPoints,
      nivel: nivelAtleta(r.totalPoints),
      melhorTempo: r.melhorTempo,
      prova: r.raceName || null,
      faixaEtaria: r.ageGroup || null
    }));
  } catch (err) {
    console.error('Ranking error:', err.message);
    return [];
  }
}

/**
 * Ranking por prova específica
 */
export async function getRankingByRace(raceId, distance = null, gender = null) {
  try {
    const distClause = distance ? 'AND r.distance = $2' : '';
    const genderClause = gender
      ? (distance ? 'AND a.gender = $3' : 'AND a.gender = $2')
      : '';

    const sql = `
      SELECT
        a.id, a.name, a.equipe, a.state, a.gender,
        r."time", r.distance, r."overallRank", r."genderRank", r."ageGroup",
        race.name as "raceName", race.city as "raceCity", race.date as "raceDate"
      FROM "Result" r
      JOIN "Athlete" a ON a.id = r."athleteId"
      JOIN "Race" race ON race.id = r."raceId"
      WHERE r."raceId" = $1
        AND r."time" != 'DNS'
        AND r."time" != '00:00:00'
        AND r."time" != ''
        AND a.name IS NOT NULL
        AND a.name != ''
        ${distClause}
        ${genderClause}
      ORDER BY r."time" ASC
      LIMIT 5000
    `;

    const params = [raceId];
    if (distance) params.push(distance);
    if (gender) params.push(gender);

    const rows = await prisma.$queryRawUnsafe(sql, ...params);

    return rows.map((r, i) => ({
      posicao: i + 1,
      id: r.id,
      name: r.name,
      equipe: r.equipe || null,
      state: r.state || null,
      city: r.raceCity || null,
      gender: r.gender,
      tempo: r.time,
      distance: r.distance,
      prova: r.raceName,
      faixaEtaria: r.ageGroup || null
    }));
  } catch (err) {
    console.error('Ranking by race error:', err.message);
    return [];
  }
}
