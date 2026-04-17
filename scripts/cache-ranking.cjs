#!/usr/bin/env node
/**
 * cache-ranking.cjs
 * Pré-calcula rankings de todas as distâncias e salva em /tmp/regeni-cache/
 * Rodado via cron a cada 1h: 0 * * * * node ~/pace-corridas-backend/scripts/cache-ranking.cjs
 */
'use strict';

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = '/tmp/regeni-cache';
const DISTANCES = ['3K', '5K', '6K', '7K', '8K', '10K', '12K', '15K', '21K', '42K'];

// Tempos mínimos por distância (filtro anti-lixo)
const MIN_TIMES = {
  '3K':  '00:08:00',
  '5K':  '00:14:00',
  '6K':  '00:16:00',
  '7K':  '00:18:00',
  '8K':  '00:21:00',
  '10K': '00:26:00',
  '12K': '00:34:00',
  '15K': '00:41:00',
  '21K': '01:00:00',
  '42K': '02:00:00',
};

function log(msg) {
  console.log(`[CACHE-RANKING ${new Date().toISOString()}] ${msg}`);
}

function nivelAtleta(pts) {
  const p = Number(pts) || 0;
  if (p >= 12000) return '⭐ Elite Mundial';
  if (p >= 7000)  return '🔥 Elite Nacional';
  if (p >= 3000)  return '💪 Elite Regional';
  if (p >= 1000)  return '📈 Sub-Elite';
  return '🌱 Avançado';
}

async function buildCache(client, distance) {
  const t0 = Date.now();
  const minTime = MIN_TIMES[distance] || '00:00:01';

  const sql = `
    SELECT DISTINCT ON (a.id)
      a.id,
      a.name,
      a.equipe,
      a.state,
      a.gender,
      a."totalPoints",
      r."time"     AS "melhorTempo",
      r."ageGroup",
      race.name    AS "raceName",
      race.city    AS "raceCity"
    FROM "Athlete" a
    JOIN "Result"  r    ON a.id      = r."athleteId"
    JOIN "Race"    race ON race.id   = r."raceId"
    WHERE replace(upper(r.distance), 'KM', 'K') = $1
      AND r."time" != 'DNS'
      AND r."time" != '00:00:00'
      AND r."time" != ''
      AND r."time" >= $2
      AND a.name IS NOT NULL
      AND a.name != ''
      AND (r."flagged" IS NULL OR r."flagged" = false)
    ORDER BY a.id, r."time" ASC
  `;

  const result = await client.query(sql, [distance, minTime]);
  const rows = result.rows;

  // Sort by best time, assign positions
  rows.sort((a, b) => a.melhorTempo.localeCompare(b.melhorTempo));

  const data = rows.slice(0, 5000).map((r, i) => ({
    posicao:      i + 1,
    id:           r.id,
    name:         r.name,
    equipe:       r.equipe   || null,
    state:        r.state    || null,
    city:         r.raceCity || null,
    gender:       r.gender,
    totalPoints:  Number(r.totalPoints) || 0,
    nivel:        nivelAtleta(r.totalPoints),
    melhorTempo:  r.melhorTempo,
    prova:        r.raceName  || null,
    faixaEtaria:  r.ageGroup  || null,
  }));

  const cache = {
    generatedAt: new Date().toISOString(),
    distance,
    count: data.length,
    data,
  };

  const filePath = path.join(CACHE_DIR, `ranking-${distance}.json`);
  fs.writeFileSync(filePath, JSON.stringify(cache));

  const ms = Date.now() - t0;
  log(`✅ Ranking ${distance} — ${data.length} atletas em ${ms}ms → ${filePath}`);
  return ms;
}

async function main() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  log(`Iniciando cache de ${DISTANCES.length} distâncias...`);
  const totalT0 = Date.now();

  for (const dist of DISTANCES) {
    try {
      await buildCache(client, dist);
    } catch (e) {
      log(`❌ Erro em ${dist}: ${e.message}`);
    }
  }

  await client.end();
  log(`🏁 Cache completo em ${Date.now() - totalT0}ms. Dir: ${CACHE_DIR}`);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
