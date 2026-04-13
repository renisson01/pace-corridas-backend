#!/usr/bin/env node
/**
 * REGENI — Scraper Yescom
 * www.yescom.com.br — sistema de cronometragem SP, RS, CE
 *
 * SITUAÇÃO: O painel de resultados Yescom (/resultados) requer login (ASP.NET WebForms).
 * Este script tenta acessar eventos via URLs públicas conhecidas.
 *
 * Para eventos com resultados públicos, a URL é do tipo:
 *   https://resultado.chiptiming.com.br/evento/<slug>  (ChipTiming é braço técnico Yescom)
 *   ou via chippower
 *
 * USO:
 *   node scripts/scraper-yescom.cjs                    # busca eventos configurados
 *   node scripts/scraper-yescom.cjs --evento <slug>    # evento específico
 *
 * NOTA: Para acesso completo, credenciais são necessárias.
 * Entre em contato com Yescom para obter acesso à API parceira.
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
  const args = process.argv.slice(2);
  console.log('\n=== REGENI Scraper Yescom ===');

  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  console.log('Conectado ao banco!\n');

  let avisos = [];

  for (const ev of EVENTOS_CONHECIDOS) {
    console.log(`[Yescom] ${ev.nome} (${ev.data})`);

    if (!ev.url) {
      console.log('  → URL ainda não disponível. Resultados publicados 24-48h após a prova.');
      avisos.push(ev.nome);
      continue;
    }

    const html = await tentarURL(ev.url);
    if (!html) {
      console.log('  → URL inacessível. Tente novamente mais tarde.');
      avisos.push(ev.nome);
      continue;
    }

    // TODO: parse HTML quando URL for conhecida
    console.log(`  → HTML disponível (${html.length} bytes). Parse não implementado para este endpoint.`);
    await DELAY(1000);
  }

  if (avisos.length) {
    console.log('\n⚠ Eventos Yescom pendentes (verificar manualmente):');
    for (const a of avisos) console.log(`  - ${a}`);
    console.log('\nPara importar manualmente após resultados publicados:');
    console.log('  1. Acesse o site do evento e copie os resultados');
    console.log('  2. Use: node scripts/import-fast.cjs <arquivo>');
    console.log('\nPara acesso automatizado: solicite credenciais à Yescom ou verifique');
    console.log('se o evento usa ChipTiming (resultado.chiptiming.com.br).');
  }

  await db.end();
  console.log('\nYescom scraper concluído.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
