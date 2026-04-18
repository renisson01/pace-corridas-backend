#!/usr/bin/env node
/**
 * REGENI — Investigador EsporteCorrida
 *
 * DIAGNÓSTICO: EsporteCorrida NÃO usa Wiclax CLAX.
 * Formato: resultado_.php?evt=N → redireciona para sistemas externos
 *
 * Mesma estrutura PHP do ForChip (provavelmente mesma empresa).
 * Este script lista os eventos e mapeia para qual timing system cada um aponta.
 *
 * Uso:
 *   node scripts/investigar-esportecorrida.cjs
 */
'use strict';

const https = require('https');
const http = require('http');

const LISTING_URL = 'https://esportecorrida.com.br/v3/resultados.php';
const BASE_URL    = 'https://esportecorrida.com.br/v3/';

function get(url, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error('too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120', 'Accept': 'text/html' },
      timeout: 20000,
    }, res => {
      if ([301,302,307,308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return get(next, depth + 1).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

const DELAY = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('\n=== Investigador EsporteCorrida ===\n');
  const html = await get(LISTING_URL);

  const evtIds = [...new Set([...html.matchAll(/resultado_\.php\?evt=(\d+)/g)].map(m => m[1]))];
  console.log(`Eventos encontrados na listing: ${evtIds.length}\n`);

  const sistemas = {};
  const sample = evtIds.slice(0, 20);

  for (const evtId of sample) {
    const url = BASE_URL + `resultado_.php?evt=${evtId}`;
    try {
      await DELAY(500);
      const page = await get(url);
      const links = [...page.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
      const external = links.filter(l =>
        !l.includes('esportecorrida.com') &&
        !l.includes('google') &&
        !l.includes('fonts') &&
        !l.includes('instagram') &&
        !l.includes('facebook')
      );
      const destino = external[0] || 'nenhum-externo';
      const dominio = destino === 'nenhum-externo' ? 'nenhum' : new URL(destino).hostname;
      sistemas[dominio] = (sistemas[dominio] || 0) + 1;
      console.log(`  evt=${evtId} → ${dominio}`);
    } catch(e) {
      console.log(`  evt=${evtId} → ERRO: ${e.message.slice(0,30)}`);
    }
  }

  console.log('\n=== Sistemas externos detectados ===');
  for (const [dom, count] of Object.entries(sistemas).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${count}x → ${dom}`);
  }
  console.log('\nCONCLUSÃO: Criar scrapers específicos por sistema externo detectado.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
