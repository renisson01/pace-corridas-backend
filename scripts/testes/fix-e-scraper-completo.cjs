#!/usr/bin/env node
/**
 * REGENI — FIX COMPLETO + SCRAPER
 * 1. Corrige estados errados (BR, BH, BS, AB)
 * 2. Insere corridas manuais reais de SE e estados fracos
 * 3. Scraper Race83 (melhor fonte de SE/PB/AL)
 * 4. Scraper Central da Corrida
 * 5. Relatório final
 */

const https = require('https');
const http = require('http');
const { Client } = require('pg');
const DELAY = ms => new Promise(r => setTimeout(r, ms));

const DB = 'postgresql://postgres:sBbOLYIKlSXCXTnLWnYRUTJVAzLUBhhF@caboose.proxy.rlwy.net:31475/railway';
let client;

// ═══════════════════════════════════════════
// UTILITÁRIOS
// ═══════════════════════════════════════════

function get(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120',
        'Accept': 'text/html,application/json,*/*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        ...extraHeaders
      },
      timeout: 20000
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        return get(res.headers.location, extraHeaders).then(resolve).catch(reject);
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function parseData(t) {
  if (!t) return null;
  const m1 = t.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m1) {
    const y = m1[3].length === 2 ? '20' + m1[3] : m1[3];
    return new Date(`${y}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`);
  }
  const m2 = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return new Date(t.substring(0,10));
  return null;
}

function clean(h) {
  return (h||'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#\d+;/g,'').replace(/\s+/g,' ').trim();
}

function uf(t) {
  if (!t) return '';
  const m = t.toUpperCase().match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);
  return m ? m[1] : '';
}

function dists(t) {
  return [...new Set((t.match(/\d+\s*km/gi)||[]).map(m=>m.replace(/\s/g,'').toLowerCase()))].join(',');
}

// ═══════════════════════════════════════════
// PASSO 1: CORRIGIR ESTADOS ERRADOS
// ═══════════════════════════════════════════

async function corrigirEstados() {
  console.log('\n🔧 PASSO 1: Corrigindo estados errados...');

  // BH → MG
  const bh = await client.query(`UPDATE "Race" SET state='MG' WHERE state='BH' RETURNING name`);
  console.log(`  ✅ BH→MG: ${bh.rowCount} corridas corrigidas`);

  // BR com cidade conhecida → tentar deduzir estado pelo nome da corrida
  const br = await client.query(`SELECT id, name, city FROM "Race" WHERE state='BR' OR state='BS' OR state='AB'`);
  console.log(`  📋 Corridas com estado inválido (BR/BS/AB): ${br.rowCount}`);

  let corrigidas = 0;
  for (const race of br.rows) {
    const texto = (race.name + ' ' + (race.city || '')).toUpperCase();
    let novoEstado = '';

    // Tenta deduzir pelo nome/cidade
    if (texto.includes('ARACAJU') || texto.includes('SERGIPE') || texto.includes(' SE ')) novoEstado = 'SE';
    else if (texto.includes('MACEIÓ') || texto.includes('ALAGOAS') || texto.includes(' AL ') || texto.includes('PALMEIRA')) novoEstado = 'AL';
    else if (texto.includes('SALVADOR') || texto.includes('BAHIA') || texto.includes(' BA ')) novoEstado = 'BA';
    else if (texto.includes('RECIFE') || texto.includes('PERNAMBUCO') || texto.includes(' PE ')) novoEstado = 'PE';
    else if (texto.includes('FORTALEZA') || texto.includes('CEARÁ') || texto.includes(' CE ')) novoEstado = 'CE';
    else if (texto.includes('NATAL') || texto.includes('RIO GRANDE DO NORTE') || texto.includes(' RN ')) novoEstado = 'RN';
    else if (texto.includes('JOÃO PESSOA') || texto.includes('PARAÍBA') || texto.includes(' PB ') || texto.includes('CAMPINA GRANDE')) novoEstado = 'PB';
    else if (texto.includes('SÃO PAULO') || texto.includes('CAMPINAS') || texto.includes('SANTOS') || texto.includes(' SP ')) novoEstado = 'SP';
    else if (texto.includes('RIO DE JANEIRO') || texto.includes('NITERÓI') || texto.includes(' RJ ')) novoEstado = 'RJ';
    else if (texto.includes('BELO HORIZONTE') || texto.includes('MINAS') || texto.includes(' MG ') || texto.includes('MONTES CLAROS')) novoEstado = 'MG';
    else if (texto.includes('CURITIBA') || texto.includes('PARANÁ') || texto.includes(' PR ') || texto.includes('LONDRINA')) novoEstado = 'PR';
    else if (texto.includes('PORTO ALEGRE') || texto.includes('RIO GRANDE DO SUL') || texto.includes(' RS ')) novoEstado = 'RS';
    else if (texto.includes('FLORIANÓPOLIS') || texto.includes('SANTA CATARINA') || texto.includes(' SC ') || texto.includes('JOINVILLE')) novoEstado = 'SC';
    else if (texto.includes('GOIÂNIA') || texto.includes('GOIÁS') || texto.includes(' GO ')) novoEstado = 'GO';
    else if (texto.includes('BRASÍLIA') || texto.includes('DISTRITO FEDERAL') || texto.includes(' DF ')) novoEstado = 'DF';
    else if (texto.includes('MANAUS') || texto.includes('AMAZONAS') || texto.includes(' AM ')) novoEstado = 'AM';
    else if (texto.includes('BELÉM') || texto.includes('PARÁ') || texto.includes(' PA ')) novoEstado = 'PA';
    else if (texto.includes('SÃO LUÍS') || texto.includes('MARANHÃO') || texto.includes(' MA ')) novoEstado = 'MA';
    else if (texto.includes('TERESINA') || texto.includes('PIAUÍ') || texto.includes(' PI ')) novoEstado = 'PI';
    else if (texto.includes('VITÓRIA') || texto.includes('ESPÍRITO SANTO') || texto.includes(' ES ')) novoEstado = 'ES';
    else if (texto.includes('CAMPO GRANDE') || texto.includes('MATO GROSSO DO SUL') || texto.includes(' MS ')) novoEstado = 'MS';
    else if (texto.includes('CUIABÁ') || texto.includes('MATO GROSSO') || texto.includes(' MT ')) novoEstado = 'MT';
    else if (texto.includes('PORTO VELHO') || texto.includes('RONDÔNIA') || texto.includes(' RO ')) novoEstado = 'RO';
    else if (texto.includes('PALMAS') || texto.includes('TOCANTINS') || texto.includes(' TO ')) novoEstado = 'TO';

    if (novoEstado) {
      await client.query(`UPDATE "Race" SET state=$1 WHERE id=$2`, [novoEstado, race.id]);
      corrigidas++;
      console.log(`  ✅ "${race.name}" → ${novoEstado}`);
    } else {
      console.log(`  ❓ Não identificado: "${race.name}" (${race.city}) — mantendo como está`);
    }
  }
  console.log(`  Total corrigidas: ${corrigidas} de ${br.rowCount}`);
}

// ═══════════════════════════════════════════
// PASSO 2: CORRIDAS MANUAIS REAIS — FOCO SE
// ═══════════════════════════════════════════

// Corridas históricas reais de SE e estados fracos com resultados conhecidos
const CORRIDAS_PARA_SCRAPER = [
  // SERGIPE — corridas com resultados no Race83/Central
  { fonte: 'race83', url: 'https://race83.com.br/corrida/corrida-do-socorro-2025', estado: 'SE' },
  { fonte: 'race83', url: 'https://race83.com.br/corrida/corrida-do-brejo-2025', estado: 'SE' },
  { fonte: 'race83', url: 'https://race83.com.br/corrida/corrida-municipal-aracaju-2025', estado: 'SE' },
  { fonte: 'race83', url: 'https://race83.com.br/corridas?estado=SE', estado: 'SE' },
  { fonte: 'race83', url: 'https://race83.com.br/corridas?estado=AL', estado: 'AL' },
  { fonte: 'race83', url: 'https://race83.com.br/corridas?estado=PB', estado: 'PB' },
  { fonte: 'race83', url: 'https://race83.com.br/corridas?estado=RN', estado: 'RN' },
  { fonte: 'race83', url: 'https://race83.com.br/corridas?estado=PE', estado: 'PE' },
  { fonte: 'race83', url: 'https://race83.com.br/corridas?estado=MA', estado: 'MA' },
  { fonte: 'race83', url: 'https://race83.com.br/corridas?estado=CE', estado: 'CE' },
  { fonte: 'race83', url: 'https://race83.com.br/corridas?estado=BA', estado: 'BA' },
  { fonte: 'race83', url: 'https://race83.com.br/corridas?estado=GO', estado: 'GO' },
  { fonte: 'race83', url: 'https://race83.com.br/corridas?estado=MG', estado: 'MG' },
  { fonte: 'race83', url: 'https://race83.com.br/corridas?estado=PR', estado: 'PR' },
  { fonte: 'race83', url: 'https://race83.com.br/corridas?estado=SC', estado: 'SC' },
  { fonte: 'race83', url: 'https://race83.com.br/corridas?estado=RS', estado: 'RS' },
  { fonte: 'race83', url: 'https://race83.com.br/corridas?estado=RJ', estado: 'RJ' },
];

// ═══════════════════════════════════════════
// PASSO 3: SCRAPER RACE83 (melhor para NE)
// ═══════════════════════════════════════════

const racesExistentes = new Set();
const atletasCache = new Map();
let totalRaces = 0;
let totalResults = 0;

async function carregarExistentes() {
  const r = await client.query(`SELECT LOWER(name) as n FROM "Race"`);
  r.rows.forEach(row => racesExistentes.add(row.n));
  console.log(`  📋 ${racesExistentes.size} corridas já no banco`);
}

async function getOuCriarAtleta(nome, genero, anoNasc) {
  const key = nome.toLowerCase().trim();
  if (atletasCache.has(key)) return atletasCache.get(key);

  // Busca no banco
  const ex = await client.query(`SELECT id FROM "Athlete" WHERE LOWER(name)=$1 LIMIT 1`, [key]);
  if (ex.rows.length > 0) {
    atletasCache.set(key, ex.rows[0].id);
    return ex.rows[0].id;
  }

  // Cria novo
  const id = 'at_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2,6);
  await client.query(
    `INSERT INTO "Athlete"(id, name, gender, "birthYear", "createdAt", "updatedAt") VALUES($1,$2,$3,$4,NOW(),NOW()) ON CONFLICT DO NOTHING`,
    [id, nome.substring(0,150), genero || null, anoNasc || null]
  );
  atletasCache.set(key, id);
  return id;
}

async function criarRace(nome, data, cidade, estado, dist, fonte) {
  const key = nome.toLowerCase().trim();
  if (racesExistentes.has(key)) return null;

  const id = 'rc_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2,6);
  try {
    await client.query(
      `INSERT INTO "Race"(id, name, date, city, state, distances, organizer, status, "createdAt", "updatedAt")
       VALUES($1,$2,$3,$4,$5,$6,$7,'completed',NOW(),NOW()) ON CONFLICT DO NOTHING`,
      [id, nome.substring(0,200), data, (cidade||'').substring(0,100), estado.substring(0,2),
       dist||'', fonte||'scraper']
    );
    racesExistentes.add(key);
    totalRaces++;
    return id;
  } catch(e) {
    return null;
  }
}

async function inserirResult(athleteId, raceId, time, pace, rank, rankGenero, dist, ageGroup) {
  if (!athleteId || !raceId) return false;
  try {
    const id = 're_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2,7);
    await client.query(
      `INSERT INTO "Result"(id, "athleteId", "raceId", time, pace, "overallRank", "genderRank", distance, "ageGroup", "createdAt")
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) ON CONFLICT DO NOTHING`,
      [id, athleteId, raceId, time||null, pace||null, rank||null, rankGenero||null, dist||null, ageGroup||null]
    );
    totalResults++;
    return true;
  } catch(e) {
    return false;
  }
}

// Scraper Race83 por estado
async function scrapeRace83Estado(estado) {
  console.log(`\n  🌐 Race83 - ${estado}...`);
  let corridasEncontradas = 0;
  let resultsInseridos = 0;

  try {
    // Página de listagem de corridas por estado
    const urls = [
      `https://race83.com.br/corridas?estado=${estado}`,
      `https://race83.com.br/resultados?estado=${estado}`,
      `https://race83.com.br/calendario?estado=${estado}`,
    ];

    for (const url of urls) {
      try {
        const { body, status } = await get(url);
        if (status !== 200) continue;

        // Extrai links de corridas individuais
        const links = [...new Set(
          [...body.matchAll(/href="(\/(?:corrida|resultado|race|event)[^"]+)"/gi)]
          .map(m => 'https://race83.com.br' + m[1])
        )];

        if (links.length === 0) {
          // Tenta extrair direto da listagem
          const items = [...body.matchAll(/<(?:div|article|li)[^>]*class="[^"]*(?:card|item|evento|corrida)[^"]*"[^>]*>([\s\S]{50,1000}?)<\/(?:div|article|li)>/gi)];
          for (const item of items) {
            const txt = item[1];
            const nome = clean(txt.match(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/i)?.[1] || '');
            const dataStr = txt.match(/(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/)?.[1] || '';
            const data = parseData(dataStr);
            if (!nome || nome.length < 5 || !data || data > new Date()) continue;
            const cidade = clean(txt.match(/(?:cidade|city|local)[^>]*>(.*?)</i)?.[1] || '').split(/[,\-]/)[0].trim();
            await criarRace(nome, data, cidade, estado, dists(nome), 'race83');
            corridasEncontradas++;
          }
        }

        // Visita cada corrida individual
        for (const link of links.slice(0, 30)) {
          await DELAY(400);
          try {
            const { body: pg, status: st } = await get(link);
            if (st !== 200) continue;

            // Nome da corrida
            const nome = clean(pg.match(/<h1[^>]*>(.*?)<\/h1>/i)?.[1] || pg.match(/<title>(.*?)<\/title>/i)?.[1] || '');
            if (!nome || nome.length < 5) continue;

            const dataStr = pg.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1] || '';
            const data = parseData(dataStr);
            const cidade = clean(pg.match(/(?:cidade|city)[^>]*>(.*?)</i)?.[1] || '').split(/[,\-]/)[0].trim() || estado;
            const estadoRace = uf(pg) || estado;
            const dist = dists(nome + ' ' + pg.substring(0, 2000));

            let raceId = await criarRace(nome, data || new Date('2024-01-01'), cidade, estadoRace, dist, 'race83');
            if (!raceId) {
              // Já existe — busca o id
              const ex = await client.query(`SELECT id FROM "Race" WHERE LOWER(name)=$1 LIMIT 1`, [nome.toLowerCase()]);
              if (ex.rows.length > 0) raceId = ex.rows[0].id;
            }
            if (!raceId) continue;

            corridasEncontradas++;

            // Extrai resultados da tabela
            const rows = [...pg.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1]);
            for (const row of rows) {
              const cols = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => clean(m[1]));
              if (cols.length < 3) continue;

              // Tenta identificar colunas: rank, nome, tempo, pace, categoria
              let nomeAtleta = '', time = '', pace = '', rank = null, genero = '';
              // Padrão comum: pos | nome | tempo | pace | cat
              for (let i = 0; i < cols.length; i++) {
                if (/^\d+$/.test(cols[i]) && !rank) rank = parseInt(cols[i]);
                else if (cols[i].length > 4 && /[a-záéíóúâêîôûãõç]/i.test(cols[i]) && !nomeAtleta) nomeAtleta = cols[i];
                else if (/\d{1,2}:\d{2}:\d{2}/.test(cols[i]) && !time) time = cols[i].match(/\d{1,2}:\d{2}:\d{2}/)[0];
                else if (/\d{1,2}:\d{2}\/km/i.test(cols[i]) && !pace) pace = cols[i];
                else if (/^[MF]$/i.test(cols[i])) genero = cols[i].toUpperCase();
              }

              if (!nomeAtleta || nomeAtleta.length < 3) continue;
              if (!time) continue;

              const athleteId = await getOuCriarAtleta(nomeAtleta, genero || null, null);
              const ok = await inserirResult(athleteId, raceId, time, pace, rank, null, dist || null, null);
              if (ok) {
                resultsInseridos++;
                if (resultsInseridos % 100 === 0) process.stdout.write(`\r    Race83 ${estado}: ${corridasEncontradas} corridas, ${resultsInseridos} resultados`);
              }
            }
          } catch(e) { /* próximo link */ }
        }

        if (corridasEncontradas > 0 || resultsInseridos > 0) break;
      } catch(e) { /* próxima URL */ }
    }
  } catch(e) {
    console.log(`\n  Erro Race83 ${estado}: ${e.message}`);
  }

  console.log(`\n    ✅ ${estado}: ${corridasEncontradas} corridas, ${resultsInseridos} resultados`);
  return { corridasEncontradas, resultsInseridos };
}

// ═══════════════════════════════════════════
// PASSO 4: SCRAPER CENTRAL DA CORRIDA
// ═══════════════════════════════════════════

async function scrapeCentralDaCorrida() {
  console.log('\n🌐 Central da Corrida...');
  let n = 0;

  const estados = ['SE','AL','PB','RN','PE','MA','CE','BA','PI','TO','RO','AM','PA','AC','AP','RR','GO','DF','MS','MT','ES','MG','RJ','PR','SC','RS','SP'];

  for (const estado of estados) {
    try {
      const urls = [
        `https://centraldacorrida.com.br/resultados?estado=${estado}`,
        `https://centraldacorrida.com.br/corridas/${estado.toLowerCase()}`,
        `https://centraldacorrida.com.br/resultados/${estado.toLowerCase()}`,
      ];

      for (const url of urls) {
        try {
          const { body, status } = await get(url);
          if (status !== 200 || body.length < 500) continue;

          const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1]);
          const cards = [...body.matchAll(/<(?:div|article)[^>]*class="[^"]*(?:card|evento|result)[^"]*"[^>]*>([\s\S]{50,800}?)<\/(?:div|article)>/gi)].map(m => m[1]);

          const items = [...rows, ...cards];
          for (const item of items) {
            const cols = item.includes('<td') ?
              [...item.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => clean(m[1])) :
              [clean(item)];

            const texto = cols.join(' ');
            const nome = clean(item.match(/<(?:h[1-4]|strong|a)[^>]*>(.*?)<\/(?:h[1-4]|strong|a)>/i)?.[1] || cols[1] || cols[0] || '');
            if (!nome || nome.length < 5) continue;

            const dataStr = texto.match(/(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/)?.[1] || '';
            const data = parseData(dataStr);
            if (!data) continue;

            const cidade = clean(item.match(/(?:cidade|city|local)[^>]*>(.*?)</i)?.[1] || '').split(/[,\-]/)[0].trim();
            const raceId = await criarRace(nome, data, cidade, estado, dists(nome), 'central-corrida');
            if (raceId) {
              n++;
              process.stdout.write(`\r  Central: ${n} corridas`);
            }
          }

          if (n > 0) break;
        } catch(e) { /* próxima URL */ }
      }
      await DELAY(300);
    } catch(e) {}
  }

  console.log(`\n  ✅ Central da Corrida: ${n} novas corridas\n`);
}

// ═══════════════════════════════════════════
// PASSO 5: RELATÓRIO FINAL
// ═══════════════════════════════════════════

async function relatorioFinal() {
  console.log('\n═══════════════════════════════════════');
  console.log('           RELATÓRIO FINAL');
  console.log('═══════════════════════════════════════');

  const totais = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM "Race") as races,
      (SELECT COUNT(*) FROM "Result") as results,
      (SELECT COUNT(*) FROM "Athlete") as athletes
  `);
  const t = totais.rows[0];
  console.log(`\n📊 TOTAIS:`);
  console.log(`  Corridas: ${t.races}`);
  console.log(`  Resultados: ${t.results}`);
  console.log(`  Atletas: ${t.athletes}`);

  const estados = await client.query(`
    SELECT state, COUNT(*) as corridas,
      (SELECT COUNT(*) FROM "Result" re JOIN "Race" r2 ON re."raceId"=r2.id WHERE r2.state=r.state) as resultados
    FROM "Race" r
    WHERE state IS NOT NULL AND LENGTH(state)=2
    GROUP BY state ORDER BY resultados DESC
  `);

  console.log(`\n📍 POR ESTADO:`);
  estados.rows.forEach(e => {
    const bar = '█'.repeat(Math.min(30, Math.floor(parseInt(e.resultados)/5000)));
    console.log(`  ${e.state}: ${e.corridas} corridas | ${e.resultados} resultados ${bar}`);
  });

  console.log(`\n✅ Novas corridas adicionadas: ${totalRaces}`);
  console.log(`✅ Novos resultados inseridos: ${totalResults}`);
  console.log('═══════════════════════════════════════');
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
  console.log('🚀 REGENI — FIX COMPLETO + SCRAPER');
  console.log(`⏰ ${new Date().toLocaleString('pt-BR')}\n`);

  client = new Client({ connectionString: DB });
  await client.connect();
  console.log('✅ Banco conectado\n');

  await carregarExistentes();

  // Passo 1: Corrigir estados
  await corrigirEstados();

  // Passo 2: Scraper Race83 — estados com poucos dados (prioridade NE)
  console.log('\n🌐 PASSO 2: Scraper Race83 por estado...');
  const estadosPrioritarios = ['SE','AL','PB','RN','PE','MA','CE','BA','PI','GO','DF','TO','RO','AM','PA','MS','MT','AC','AP','RR','ES','MG','RJ','PR','SC','RS'];
  for (const estado of estadosPrioritarios) {
    await scrapeRace83Estado(estado);
    await DELAY(500);
  }

  // Passo 3: Central da Corrida
  console.log('\n🌐 PASSO 3: Scraper Central da Corrida...');
  await scrapeCentralDaCorrida();

  // Relatório
  await relatorioFinal();

  await client.end();
  console.log('\n✅ Concluído!');
}

main().catch(e => {
  console.error('ERRO FATAL:', e.message);
  process.exit(1);
});
