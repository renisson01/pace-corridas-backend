#!/usr/bin/env node
/**
 * REGENI Health Check Daemon
 * Testa ranking, atlas, etc a cada minuto
 * ZERO tokens — roda só com Node.js
 */

const http = require('http');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const API_URL = 'http://localhost:8080';
const LOG_FILE = '/tmp/regeni-health.log';

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  console.log(line);
  require('fs').appendFileSync(LOG_FILE, line);
}

async function testRanking() {
  return new Promise((resolve) => {
    const url = new URL('/ranking/10km', API_URL);
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (Array.isArray(json) && json.length > 0) {
            resolve({ ok: true, count: json.length, msg: `Ranking 10K: ${json.length} atletas` });
          } else {
            resolve({ ok: false, msg: 'Ranking retornou array vazio' });
          }
        } catch (e) {
          resolve({ ok: false, msg: `JSON parse error: ${e.message}` });
        }
      });
    }).on('error', (err) => {
      resolve({ ok: false, msg: `HTTP error: ${err.message}` });
    });
  });
}

async function testDB() {
  try {
    const races = await prisma.race.count();
    const athletes = await prisma.athlete.count();
    const results = await prisma.result.count();
    
    if (races > 0 && athletes > 0 && results > 0) {
      return { ok: true, msg: `DB: ${races} races, ${athletes} athletes, ${results} results` };
    } else {
      return { ok: false, msg: `DB: races=${races}, athletes=${athletes}, results=${results}` };
    }
  } catch (e) {
    return { ok: false, msg: `DB error: ${e.message}` };
  }
}

async function testAnalytics() {
  return new Promise((resolve) => {
    http.get(API_URL + '/analytics/overview', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.totalRaces && json.totalResults && json.totalAthletes) {
            resolve({ ok: true, msg: `Analytics: ${json.totalRaces} races, ${json.totalResults} results, ${json.totalAthletes} athletes` });
          } else {
            resolve({ ok: false, msg: 'Analytics retornou dados incompletos' });
          }
        } catch (e) {
          resolve({ ok: false, msg: `Analytics parse error: ${e.message}` });
        }
      });
    }).on('error', (err) => {
      resolve({ ok: false, msg: `Analytics HTTP error: ${err.message}` });
    });
  });
}

async function healthCheck() {
  try {
    log('=== HEALTH CHECK START ===');
    
    const db = await testDB();
    log(`📦 ${db.msg}`);
    
    const ranking = await testRanking();
    log(`🏃 ${ranking.msg}`);
    
    const analytics = await testAnalytics();
    log(`📊 ${analytics.msg}`);
    
    const allOk = db.ok && ranking.ok && analytics.ok;
    log(`Status: ${allOk ? '✅ OK' : '⚠️ ISSUES FOUND'}`);
    log('=== HEALTH CHECK END ===\n');
    
    return allOk;
  } catch (err) {
    log(`❌ FATAL: ${err.message}`);
    return false;
  }
}

async function main() {
  log('🚀 REGENI Health Check Daemon started');
  log(`Running checks every 60 seconds...\n`);
  
  // First check immediately
  await healthCheck();
  
  // Then every 60 seconds
  setInterval(healthCheck, 60000);
}

main().catch(err => {
  log(`🔥 FATAL ERROR: ${err.message}`);
  process.exit(1);
});
