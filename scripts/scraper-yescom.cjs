#!/usr/bin/env node
/**
 * REGENI — Scraper Yescom
 * www.yescom.com.br — organizador SP/RS/CE (Maratona SP, Meia Rio, Pampulha, etc.)
 *
 * SITUAÇÃO CONFIRMADA (investigação 17/04/2026):
 *   Yescom NÃO hospeda resultados próprios — embeds iframe do ChipTiming:
 *     <iframe src="https://resultado.chiptiming.com.br/resultados/{ano}/iframe/{slug}">
 *
 *   Todos os dados estão na API pública do ChipTiming:
 *     GET https://resultado.chiptiming.com.br/api/v1/eventos → lista completa
 *     GET https://resultado.chiptiming.com.br/api/v1/resultados/{ano}/{slug} → resultados paginados
 *
 *   USAR: node scripts/scraper-chiptiming-resultado.cjs
 *   (cobre todos os eventos Yescom automaticamente)
 *
 * USO DESTE SCRIPT:
 *   node scripts/scraper-yescom.cjs  → redireciona para chiptiming-resultado
 */
const { Client } = require('pg');
const DB_URL = process.env.DATABASE_URL;

const DELAY = ms => new Promise(r => setTimeout(r, ms));

// ─── Eventos conhecidos com URLs públicas ────────────────────────────────────
// Adicione aqui slugs de eventos Yescom com resultados públicos
const EVENTOS_CONHECIDOS = [
  // Maratona Internacional de São Paulo 2026 (12/04/2026)
  // Yescom é a cronometria oficial — resultados geralmente aparecem em 24-48h
  // URL esperada quando publicados:
  { nome: 'Maratona Internacional de São Paulo 2026', data: '2026-04-12', cidade: 'São Paulo', estado: 'SP', url: null /* pendente */ },
];

async function tentarURL(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch (_) { return null; }
}

async function main() {
  console.log('\n=== REGENI Scraper Yescom ===');
  console.log('');
  console.log('Yescom usa ChipTiming para resultados (iframe embed confirmado).');
  console.log('Use o scraper dedicado:');
  console.log('');
  console.log('  node scripts/scraper-chiptiming-resultado.cjs');
  console.log('');
  console.log('Esse script cobre todos os eventos Yescom automaticamente via');
  console.log('resultado.chiptiming.com.br/api/v1 (API pública, sem autenticação).');
  console.log('');
  console.log('Exemplos de eventos Yescom disponíveis:');
  console.log('  30ª Maratona Internacional SP 2026  → slug: 30maratonadesp');
  console.log('  19ª Meia Maratona de São Paulo 2026 → slug: 19meiamaratonadesaopaulo');
  console.log('');
  console.log('Para evento específico:');
  console.log('  node scripts/scraper-chiptiming-resultado.cjs --evento 30maratonadesp');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
