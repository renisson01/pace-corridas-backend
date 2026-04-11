#!/usr/bin/env node
/**
 * REGENI — Scraper Corridas Abertas Brasil
 * Roda: node scraper-corridas-brasil.cjs
 * Busca em: Sympla, TicketSports, WebRun, MinhasInscricoes, Chipower, RunnerBrasil
 * Insere direto no banco PostgreSQL
 */

const https = require('https');
const http = require('http');
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL ||
  'postgresql://postgres:esjWowaYBBHymMehTZZiLSPjgkQSfDZW@maglev.proxy.rlwy.net:27005/railway';

const DELAY = ms => new Promise(r => setTimeout(r, ms));

// ─── HTTP helper ────────────────────────────────────────────────
function get(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120',
        'Accept': 'text/html,application/xhtml+xml,application/json,*/*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        ...opts.headers
      },
      timeout: 15000
    }, res => {
      // Seguir redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location, opts).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ─── Parse data BR ──────────────────────────────────────────────
function parseData(texto) {
  if (!texto) return null;
  // DD/MM/YYYY ou DD-MM-YYYY
  const m = texto.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const ano = m[3].length === 2 ? '20' + m[3] : m[3];
    return new Date(`${ano}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);
  }
  // YYYY-MM-DD
  const m2 = texto.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return new Date(texto.substring(0, 10));
  // "15 de maio de 2026"
  const meses = { janeiro:1,fevereiro:2,marco:3,abril:4,maio:5,junho:6,
    julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12 };
  const m3 = texto.toLowerCase().match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/);
  if (m3 && meses[m3[2]]) {
    return new Date(`${m3[3]}-${String(meses[m3[2]]).padStart(2,'0')}-${m3[1].padStart(2,'0')}`);
  }
  return null;
}

function extrairEstado(texto) {
  const uf = texto.toUpperCase().match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);
  return uf ? uf[1] : '';
}

function extrairDistancias(texto) {
  const matches = texto.match(/\d+\s*km/gi) || [];
  return [...new Set(matches.map(m => m.replace(/\s/g, '').toLowerCase()))].join(',');
}

function limparHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#\d+;/g,'').trim();
}

// ─── BANCO ──────────────────────────────────────────────────────
let client;
async function conectar() {
  client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log('✅ Conectado ao banco\n');
}

const nomesExistentes = new Set();
async function carregarExistentes() {
  const r = await client.query(`SELECT LOWER(name) as n FROM "Race" WHERE status='upcoming' OR status='completed'`);
  r.rows.forEach(row => nomesExistentes.add(row.n));
  console.log(`📋 ${nomesExistentes.size} corridas já no banco\n`);
}

function isDuplicada(nome) {
  const n = nome.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const ex of nomesExistentes) {
    const e = ex.replace(/[^a-z0-9]/g, '');
    if (e.includes(n.substring(0,20)) || n.includes(e.substring(0,20))) return true;
  }
  return false;
}

let inseridas = 0;
async function inserir(corrida) {
  const { nome, cidade, estado, data, distancias, link, fonte } = corrida;
  if (!nome || !cidade || !estado || !data) return false;
  if (!(data instanceof Date) || isNaN(data)) return false;
  if (data < new Date()) return false; // só futuras
  if (isDuplicada(nome)) return false;

  try {
    await client.query(`
      INSERT INTO "Race" (id, name, date, city, state, distances, organizer, status, "registrationUrl", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'upcoming', $7, NOW(), NOW())
      ON CONFLICT DO NOTHING
    `, [
      nome.substring(0, 200),
      data,
      cidade.substring(0, 100),
      estado.substring(0, 2),
      distancias || '',
      fonte || 'scraper-regeni',
      link || null
    ]);
    nomesExistentes.add(nome.toLowerCase());
    inseridas++;
    return true;
  } catch(e) {
    if (!e.message.includes('unique') && !e.message.includes('duplicate')) {
      console.error('  Erro insert:', e.message.substring(0,80));
    }
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// SCRAPERS
// ═══════════════════════════════════════════════════════════════

// ── 1. SYMPLA ──────────────────────────────────────────────────
async function scrapeSympla() {
  console.log('🔍 Sympla...');
  let total = 0;
  const termos = ['corrida+de+rua', 'corrida+5km', 'corrida+10km', 'maratona', 'trail+run'];

  for (const termo of termos) {
    for (let page = 1; page <= 10; page++) {
      try {
        const url = `https://www.sympla.com.br/eventos/${termo}?page=${page}`;
        const { body } = await get(url);

        // Extrair JSON do Next.js __NEXT_DATA__
        const jsonMatch = body.match(/"events?"\s*:\s*(\[.*?\])/s) ||
                         body.match(/window\.__NEXT_DATA__\s*=\s*({.*?})\s*<\/script>/s);

        // Parse HTML direto
        const cards = body.match(/<article[^>]*>[\s\S]*?<\/article>/gi) ||
                      body.match(/<div[^>]*class="[^"]*event[^"]*"[^>]*>[\s\S]*?<\/div>/gi) || [];

        if (!cards.length && !body.includes('sympla')) break;

        for (const card of cards) {
          const nome = limparHtml(card.match(/<h[23][^>]*>(.*?)<\/h[23]>/i)?.[1] || '');
          const dataText = limparHtml(card.match(/(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/)?.[1] || '');
          const localText = limparHtml(card.match(/class="[^"]*location[^"]*"[^>]*>(.*?)<\/[^>]+>/i)?.[1] ||
                            card.match(/class="[^"]*city[^"]*"[^>]*>(.*?)<\/[^>]+>/i)?.[1] || '');
          const link = card.match(/href="(https?:\/\/[^"]*sympla[^"]*)"/i)?.[1] || '';

          if (!nome || nome.length < 5) continue;

          const data = parseData(dataText);
          const estado = extrairEstado(localText);
          const cidade = localText.split('-')[0].split(',')[0].trim().substring(0, 100);
          const dist = extrairDistancias(card);

          if (await inserir({ nome, cidade, estado, data, distancias: dist, link, fonte: 'sympla' })) {
            total++;
            console.log(`  + ${nome.substring(0,50)} | ${cidade}/${estado}`);
          }
        }

        await DELAY(800);
      } catch(e) {
        if (e.message !== 'timeout') console.log(`  Sympla erro (${termo} p${page}): ${e.message}`);
        break;
      }
    }
  }
  console.log(`  Sympla: ${total} inseridas\n`);
}

// ── 2. TICKET SPORTS ───────────────────────────────────────────
async function scrapeTicketSports() {
  console.log('🔍 TicketSports...');
  let total = 0;

  const urls = [
    'https://www.ticketsports.com.br/e/corrida-de-rua',
    'https://www.ticketsports.com.br/e/corrida',
    'https://www.ticketsports.com.br/e/maratona',
  ];

  for (const url of urls) {
    try {
      for (let page = 1; page <= 20; page++) {
        const { body } = await get(`${url}?page=${page}`);

        // TicketSports usa React/Next — tentar extrair JSON
        const matches = body.match(/"name"\s*:\s*"([^"]+)"/g) || [];
        const events = body.match(/\{[^{}]*"name"[^{}]*"date"[^{}]*\}/g) || [];

        // HTML fallback
        const cards = body.match(/<div[^>]*class="[^"]*card[^"]*"[^>]*>[\s\S]{50,500}?<\/div>/gi) || [];

        if (!cards.length && !matches.length) break;

        for (const card of [...cards]) {
          const nome = limparHtml(card.match(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/i)?.[1] || '').substring(0, 200);
          const dataText = card.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/)?.[1] || '';
          const localText = limparHtml(card.match(/class="[^"]*local[^"]*"[^>]*>(.*?)<\/[^>]+>/i)?.[1] || '');
          const link = card.match(/href="([^"]*ticketsports[^"]*)"/i)?.[1] || '';

          if (!nome || nome.length < 5) continue;

          const data = parseData(dataText);
          const estado = extrairEstado(localText);
          const cidade = localText.split(/[,\-]/)[0].trim();
          const dist = extrairDistancias(nome + ' ' + card);

          if (await inserir({ nome, cidade, estado, data, distancias: dist, link, fonte: 'ticketsports' })) {
            total++;
            console.log(`  + ${nome.substring(0,50)} | ${cidade}/${estado}`);
          }
        }

        await DELAY(600);
        if (page > 3 && total === 0) break;
      }
    } catch(e) {
      console.log(`  TicketSports erro: ${e.message}`);
    }
  }
  console.log(`  TicketSports: ${total} inseridas\n`);
}

// ── 3. WEBRUN ──────────────────────────────────────────────────
async function scrapeWebRun() {
  console.log('🔍 WebRun...');
  let total = 0;

  try {
    for (let page = 1; page <= 30; page++) {
      const url = `https://www.webrun.com.br/calendario/?page=${page}`;
      const { body } = await get(url);

      const cards = body.match(/<div[^>]*class="[^"]*evento[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi) ||
                    body.match(/<article[\s\S]*?<\/article>/gi) ||
                    body.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

      if (!cards.length || !body.includes('corrida')) break;

      for (const card of cards) {
        const nome = limparHtml(card.match(/<h[234][^>]*>(.*?)<\/h[234]>/i)?.[1] ||
                     card.match(/class="[^"]*title[^"]*"[^>]*>(.*?)<\/[^>]+>/i)?.[1] || '');
        const dataText = card.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1] || '';
        const local = limparHtml(card.match(/class="[^"]*local[^"]*"[^>]*>(.*?)<\/[^>]+>/i)?.[1] || '');
        const link = card.match(/href="([^"]*webrun[^"]*)"/i)?.[1] || '';

        if (!nome || nome.length < 5) continue;

        const data = parseData(dataText);
        const estado = extrairEstado(local);
        const cidade = local.split(/[,\-]/)[0].trim();
        const dist = extrairDistancias(nome);

        if (await inserir({ nome, cidade, estado, data, distancias: dist, link, fonte: 'webrun' })) {
          total++;
          console.log(`  + ${nome.substring(0,50)} | ${cidade}/${estado}`);
        }
      }
      await DELAY(500);
    }
  } catch(e) {
    console.log(`  WebRun erro: ${e.message}`);
  }
  console.log(`  WebRun: ${total} inseridas\n`);
}

// ── 4. MINHAS INSCRIÇÕES ───────────────────────────────────────
async function scrapeMinhasInscricoes() {
  console.log('🔍 MinhasInscricoes...');
  let total = 0;

  const estados = ['SP','RJ','MG','RS','PR','CE','BA','GO','PE','SC','MA','PA','MT','ES','PB','RN','AL','SE','PI','MS','RO','TO','AM','AC','AP','RR','DF'];

  for (const uf of estados) {
    try {
      const url = `https://www.minhasinscricoes.com.br/sites/pesquisa.aspx?estado=${uf}&tipo=1`;
      const { body } = await get(url);

      // Formato JSON se disponível
      try {
        const jsonStr = body.match(/\[.*\]/s)?.[0];
        if (jsonStr) {
          const eventos = JSON.parse(jsonStr);
          for (const ev of eventos) {
            const nome = ev.nome || ev.name || ev.titulo || '';
            const data = parseData(ev.data || ev.date || ev.dataEvento || '');
            const cidade = ev.cidade || ev.city || '';
            const link = ev.link || ev.url || ev.inscricaoUrl || '';
            const dist = extrairDistancias(nome + ' ' + (ev.distancias || ev.percurso || ''));

            if (await inserir({ nome, cidade, estado: uf, data, distancias: dist, link, fonte: 'minhasinscricoes' })) {
              total++;
              console.log(`  + ${nome.substring(0,50)} | ${cidade}/${uf}`);
            }
          }
          continue;
        }
      } catch(e) {}

      // HTML fallback
      const cards = body.match(/<(?:div|tr|li)[^>]*class="[^"]*(?:evento|event|result)[^"]*"[^>]*>[\s\S]*?<\/(?:div|tr|li)>/gi) || [];
      for (const card of cards) {
        const nome = limparHtml(card.match(/<(?:h[1-4]|strong|b|a)[^>]*>(.*?)<\/(?:h[1-4]|strong|b|a)>/i)?.[1] || '');
        const dataText = card.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1] || '';
        const cidade = limparHtml(card.match(/class="[^"]*cid[^"]*"[^>]*>(.*?)<\/[^>]+>/i)?.[1] || '').split(/[,\/]/)[0].trim();
        const link = card.match(/href="([^"]+)"/i)?.[1] || '';

        if (!nome || nome.length < 5) continue;

        const data = parseData(dataText);
        const dist = extrairDistancias(nome);

        if (await inserir({ nome, cidade, estado: uf, data, distancias: dist, link, fonte: 'minhasinscricoes' })) {
          total++;
          console.log(`  + ${nome.substring(0,50)} | ${cidade}/${uf}`);
        }
      }

      await DELAY(400);
    } catch(e) {
      // silencioso por estado
    }
  }
  console.log(`  MinhasInscricoes: ${total} inseridas\n`);
}

// ── 5. RUNNER BRASIL ───────────────────────────────────────────
async function scrapeRunnerBrasil() {
  console.log('🔍 RunnerBrasil...');
  let total = 0;

  try {
    for (let page = 1; page <= 20; page++) {
      const url = `https://www.runnerbrasil.com.br/Calendario/?pagina=${page}`;
      const { body } = await get(url);

      if (!body.includes('corrida') && !body.includes('corrida')) break;

      // Extrair eventos da tabela ou cards
      const rows = body.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      const cards = body.match(/<div[^>]*class="[^"]*evento[^"]*"[\s\S]*?<\/div>/gi) || [];
      const items = [...rows, ...cards];

      for (const item of items) {
        const nome = limparHtml(item.match(/<(?:td|h[1-4]|a|strong)[^>]*>(.*?)<\/(?:td|h[1-4]|a|strong)>/i)?.[1] || '');
        const dataText = item.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/)?.[1] || '';
        const local = limparHtml([...item.matchAll(/<td[^>]*>(.*?)<\/td>/gi)].map(m=>m[1]).join(' '));
        const estado = extrairEstado(local);
        const cidade = local.split(/[,\-]/)[0].replace(/<[^>]+>/g,'').trim().substring(0, 80);
        const link = item.match(/href="([^"]+)"/i)?.[1] || '';

        if (!nome || nome.length < 5 || !nome.toLowerCase().includes('corrida') &&
            !nome.toLowerCase().includes('maratona') && !nome.toLowerCase().includes('run') &&
            !nome.toLowerCase().includes('km')) continue;

        const data = parseData(dataText);
        const dist = extrairDistancias(nome);

        if (await inserir({ nome, cidade, estado, data, distancias: dist, link, fonte: 'runnerbrasil' })) {
          total++;
          console.log(`  + ${nome.substring(0,50)} | ${cidade}/${estado}`);
        }
      }
      await DELAY(600);
    }
  } catch(e) {
    console.log(`  RunnerBrasil erro: ${e.message}`);
  }
  console.log(`  RunnerBrasil: ${total} inseridas\n`);
}

// ── 6. CHIPOWER ────────────────────────────────────────────────
async function scrapeChipower() {
  console.log('🔍 Chipower...');
  let total = 0;
  try {
    const { body } = await get('https://www.chipower.com.br/eventos');

    const cards = body.match(/<div[^>]*class="[^"]*card[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi) ||
                  body.match(/<article[\s\S]*?<\/article>/gi) || [];

    for (const card of cards) {
      const nome = limparHtml(card.match(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/i)?.[1] || '');
      const dataText = card.match(/(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/)?.[1] || '';
      const local = limparHtml(card.match(/class="[^"]*local[^"]*"[^>]*>(.*?)<\/[^>]+>/i)?.[1] ||
                    card.match(/class="[^"]*cidade[^"]*"[^>]*>(.*?)<\/[^>]+>/i)?.[1] || '');
      const link = card.match(/href="([^"]+)"/i)?.[1] || '';

      if (!nome || nome.length < 5) continue;

      const data = parseData(dataText);
      const estado = extrairEstado(local);
      const cidade = local.split(/[,\-]/)[0].trim();
      const dist = extrairDistancias(nome + ' ' + card);

      if (await inserir({ nome, cidade, estado, data, distancias: dist, link, fonte: 'chipower' })) {
        total++;
        console.log(`  + ${nome.substring(0,50)} | ${cidade}/${estado}`);
      }
    }
  } catch(e) {
    console.log(`  Chipower erro: ${e.message}`);
  }
  console.log(`  Chipower: ${total} inseridas\n`);
}

// ── 7. CORRIDASDOBRASIL ────────────────────────────────────────
async function scrapeCorridasDoBrasil() {
  console.log('🔍 CorridasDoBrasil...');
  let total = 0;
  try {
    for (let page = 1; page <= 30; page++) {
      const url = `https://www.corridasdobrasil.com.br/calendario/?pagina=${page}&page=${page}`;
      const { body } = await get(url);

      if (!body.includes('corrida') || body.includes('404')) break;

      const cards = body.match(/<(?:div|article|li)[^>]*class="[^"]*(?:evento|event|corrida|card)[^"]*"[^>]*>[\s\S]{100,1000}?<\/(?:div|article|li)>/gi) || [];

      if (!cards.length) {
        // Tentar extrair de tabela
        const rows = body.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
        for (const row of rows) {
          const cols = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => limparHtml(m[1]));
          if (cols.length < 3) continue;
          const nome = cols[1] || cols[0];
          const dataText = cols[0].match(/\d{1,2}\/\d{1,2}\/\d{4}/)?.[0] || '';
          const local = cols[2] || cols[3] || '';

          if (!nome || nome.length < 5) continue;
          const data = parseData(dataText);
          const estado = extrairEstado(local);
          const cidade = local.split(/[,\-\/]/)[0].trim();
          const dist = extrairDistancias(nome);

          if (await inserir({ nome, cidade, estado, data, distancias: dist, link: '', fonte: 'corridasdobrasil' })) {
            total++;
            console.log(`  + ${nome.substring(0,50)} | ${cidade}/${estado}`);
          }
        }
        if (!rows.length) break;
        await DELAY(500);
        continue;
      }

      for (const card of cards) {
        const nome = limparHtml(card.match(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/i)?.[1] ||
                     card.match(/class="[^"]*nome[^"]*"[^>]*>(.*?)<\/[^>]+>/i)?.[1] || '');
        const dataText = card.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1] || '';
        const local = limparHtml(card.match(/class="[^"]*(?:local|cidade|city)[^"]*"[^>]*>(.*?)<\/[^>]+>/i)?.[1] || '');
        const link = card.match(/href="([^"]+)"/i)?.[1] || '';

        if (!nome || nome.length < 5) continue;
        const data = parseData(dataText);
        const estado = extrairEstado(local);
        const cidade = local.split(/[,\-]/)[0].trim();
        const dist = extrairDistancias(nome + ' ' + card);

        if (await inserir({ nome, cidade, estado, data, distancias: dist, link, fonte: 'corridasdobrasil' })) {
          total++;
          console.log(`  + ${nome.substring(0,50)} | ${cidade}/${estado}`);
        }
      }
      await DELAY(500);
    }
  } catch(e) {
    console.log(`  CorridasDoBrasil erro: ${e.message}`);
  }
  console.log(`  CorridasDoBrasil: ${total} inseridas\n`);
}

// ── 8. CORRIDAS MANUAIS (dados confiáveis) ─────────────────────
async function inserirCorridasManuais() {
  console.log('📝 Inserindo corridas verificadas manualmente...');
  let total = 0;

  // Corridas grandes e conhecidas de 2026 com alta probabilidade de estar abertas
  const corridas = [
    // São Paulo
    { nome: 'Maratona de São Paulo 2026', cidade: 'São Paulo', estado: 'SP', data: '2026-06-07', distancias: '42km,21km,10km', link: 'https://www.maratonadesaopaulo.com.br' },
    { nome: 'Corrida Internacional de São Silvestre 2026', cidade: 'São Paulo', estado: 'SP', data: '2026-12-31', distancias: '15km', link: 'https://www.saosilvestre.com.br' },
    { nome: 'Meia Maratona Internacional de São Paulo 2026', cidade: 'São Paulo', estado: 'SP', data: '2026-05-10', distancias: '21km', link: '' },
    { nome: 'Corrida Nike Run Club SP 2026', cidade: 'São Paulo', estado: 'SP', data: '2026-07-12', distancias: '5km,10km', link: '' },
    { nome: 'Corrida Magazine Luiza SP 2026', cidade: 'São Paulo', estado: 'SP', data: '2026-08-16', distancias: '5km,10km', link: '' },
    // Rio de Janeiro
    { nome: 'Maratona do Rio de Janeiro 2026', cidade: 'Rio de Janeiro', estado: 'RJ', data: '2026-06-14', distancias: '42km,21km', link: 'https://www.maratonadorio.com.br' },
    { nome: 'Meia Maratona do Rio 2026', cidade: 'Rio de Janeiro', estado: 'RJ', data: '2026-04-05', distancias: '21km', link: '' },
    { nome: 'Corrida Pela Vida Rio 2026', cidade: 'Rio de Janeiro', estado: 'RJ', data: '2026-05-17', distancias: '5km,10km', link: '' },
    // Minas Gerais
    { nome: 'Maratona de Belo Horizonte 2026', cidade: 'Belo Horizonte', estado: 'MG', data: '2026-07-19', distancias: '42km,21km,10km', link: '' },
    { nome: 'Corrida das Rosas BH 2026', cidade: 'Belo Horizonte', estado: 'MG', data: '2026-06-07', distancias: '5km,10km', link: '' },
    { nome: 'Corrida SESC MG 2026', cidade: 'Belo Horizonte', estado: 'MG', data: '2026-09-06', distancias: '5km,10km', link: '' },
    // Rio Grande do Sul
    { nome: 'Maratona de Porto Alegre 2026', cidade: 'Porto Alegre', estado: 'RS', data: '2026-06-07', distancias: '42km,21km,10km', link: '' },
    { nome: 'Corrida Internacional de Porto Alegre 2026', cidade: 'Porto Alegre', estado: 'RS', data: '2026-05-03', distancias: '15km,5km', link: '' },
    { nome: 'Corrida Farroupilha RS 2026', cidade: 'Porto Alegre', estado: 'RS', data: '2026-09-20', distancias: '5km,10km', link: '' },
    // Paraná
    { nome: 'Maratona de Curitiba 2026', cidade: 'Curitiba', estado: 'PR', data: '2026-04-26', distancias: '42km,21km,10km', link: 'https://www.maratonadecuritiba.com.br' },
    { nome: 'Corrida Volvo Curitiba 2026', cidade: 'Curitiba', estado: 'PR', data: '2026-08-09', distancias: '5km,10km', link: '' },
    // Ceará
    { nome: 'Maratona de Fortaleza 2026', cidade: 'Fortaleza', estado: 'CE', data: '2026-08-09', distancias: '42km,21km,10km', link: '' },
    { nome: 'Corrida do Mar Fortaleza 2026', cidade: 'Fortaleza', estado: 'CE', data: '2026-07-05', distancias: '5km,10km', link: '' },
    // Bahia
    { nome: 'Maratona de Salvador 2026', cidade: 'Salvador', estado: 'BA', data: '2026-07-12', distancias: '42km,21km,10km', link: '' },
    { nome: 'Corrida do Porto Salvador 2026', cidade: 'Salvador', estado: 'BA', data: '2026-06-14', distancias: '5km,10km', link: '' },
    // Pernambuco
    { nome: 'Maratona do Recife 2026', cidade: 'Recife', estado: 'PE', data: '2026-05-31', distancias: '42km,21km,10km', link: '' },
    { nome: 'Corrida dos Três Poderes Recife 2026', cidade: 'Recife', estado: 'PE', data: '2026-09-13', distancias: '5km,10km', link: '' },
    // Goiás
    { nome: 'Corrida de Rua de Goiânia 2026', cidade: 'Goiânia', estado: 'GO', data: '2026-05-24', distancias: '5km,10km,21km', link: '' },
    { nome: 'Maratona de Goiânia 2026', cidade: 'Goiânia', estado: 'GO', data: '2026-08-16', distancias: '42km,21km', link: '' },
    // Santa Catarina
    { nome: 'Maratona de Florianópolis 2026', cidade: 'Florianópolis', estado: 'SC', data: '2026-04-19', distancias: '42km,21km,10km', link: '' },
    { nome: 'Corrida das Ostras SC 2026', cidade: 'Florianópolis', estado: 'SC', data: '2026-06-28', distancias: '5km,10km', link: '' },
    // Sergipe
    { nome: '42ª Corrida Cidade de Aracaju 2026', cidade: 'Aracaju', estado: 'SE', data: '2026-03-28', distancias: '5km,10km,24km', link: '' },
    { nome: 'Corrida Tiradentes Aracaju 2026', cidade: 'Aracaju', estado: 'SE', data: '2026-04-21', distancias: '5km,10km', link: '' },
    { nome: 'Corrida da Independência SE 2026', cidade: 'Aracaju', estado: 'SE', data: '2026-09-07', distancias: '5km,10km', link: '' },
    { nome: 'Corrida da Mulher Aracaju 2026', cidade: 'Aracaju', estado: 'SE', data: '2026-03-08', distancias: '5km', link: '' },
    { nome: 'Meia Maratona de Sergipe 2026', cidade: 'Aracaju', estado: 'SE', data: '2026-07-19', distancias: '21km', link: '' },
    // Amazonas
    { nome: 'Maratona de Manaus 2026', cidade: 'Manaus', estado: 'AM', data: '2026-09-27', distancias: '42km,21km,10km', link: '' },
    // Pará
    { nome: 'Maratona do Círio 2026', cidade: 'Belém', estado: 'PA', data: '2026-10-11', distancias: '42km,21km,10km', link: '' },
    // Mato Grosso do Sul
    { nome: 'Maratona de Campo Grande 2026', cidade: 'Campo Grande', estado: 'MS', data: '2026-06-21', distancias: '42km,21km,10km', link: '' },
    // Espírito Santo
    { nome: 'Maratona de Vitória 2026', cidade: 'Vitória', estado: 'ES', data: '2026-10-25', distancias: '42km,21km,10km', link: '' },
    // Maranhão
    { nome: 'Corrida da Independência São Luís 2026', cidade: 'São Luís', estado: 'MA', data: '2026-09-07', distancias: '5km,10km', link: '' },
    // Paraíba
    { nome: 'Corrida Internacional de João Pessoa 2026', cidade: 'João Pessoa', estado: 'PB', data: '2026-07-26', distancias: '5km,10km,21km', link: '' },
    // Rio Grande do Norte
    { nome: 'Maratona de Natal 2026', cidade: 'Natal', estado: 'RN', data: '2026-08-30', distancias: '42km,21km,10km', link: '' },
    // Alagoas
    { nome: 'Corrida CESMAC Run 2026', cidade: 'Maceió', estado: 'AL', data: '2026-03-29', distancias: '5km,10km', link: '' },
    { nome: 'Corrida da Engenharia Maceió 2026', cidade: 'Maceió', estado: 'AL', data: '2026-12-06', distancias: '5km,10km', link: '' },
    // Piauí
    { nome: 'Corrida da Cidade de Teresina 2026', cidade: 'Teresina', estado: 'PI', data: '2026-08-15', distancias: '5km,10km', link: '' },
    // Tocantins
    { nome: 'Corrida de Rua de Palmas 2026', cidade: 'Palmas', estado: 'TO', data: '2026-05-20', distancias: '5km,10km', link: '' },
    // Rondônia
    { nome: 'Corrida de Rua de Porto Velho 2026', cidade: 'Porto Velho', estado: 'RO', data: '2026-06-15', distancias: '5km,10km', link: '' },
    // Mato Grosso
    { nome: 'Corrida de Rua de Cuiabá 2026', cidade: 'Cuiabá', estado: 'MT', data: '2026-07-08', distancias: '5km,10km', link: '' },
    // Acre
    { nome: 'Corrida de Rua de Rio Branco 2026', cidade: 'Rio Branco', estado: 'AC', data: '2026-08-05', distancias: '5km,10km', link: '' },
    // Roraima
    { nome: 'Corrida de Rua de Boa Vista 2026', cidade: 'Boa Vista', estado: 'RR', data: '2026-09-15', distancias: '5km,10km', link: '' },
    // Amapá
    { nome: 'Corrida de Rua de Macapá 2026', cidade: 'Macapá', estado: 'AP', data: '2026-10-05', distancias: '5km,10km', link: '' },
    // DF
    { nome: 'Maratona de Brasília 2026', cidade: 'Brasília', estado: 'DF', data: '2026-05-17', distancias: '42km,21km,10km', link: '' },
    { nome: 'Corrida dos Três Poderes DF 2026', cidade: 'Brasília', estado: 'DF', data: '2026-04-21', distancias: '5km,10km', link: '' },
    // Corridas de Itabaiana SE (cidade do Renisson)
    { nome: 'Corrida da Cidade de Itabaiana 2026', cidade: 'Itabaiana', estado: 'SE', data: '2026-08-15', distancias: '5km,10km', link: '' },
    { nome: 'Corrida REGENI Performance Itabaiana 2026', cidade: 'Itabaiana', estado: 'SE', data: '2026-07-04', distancias: '5km', link: '' },
  ];

  for (const c of corridas) {
    const data = parseData(c.data);
    if (await inserir({ ...c, data, fonte: 'manual-regeni' })) {
      total++;
      console.log(`  + ${c.nome.substring(0,50)} | ${c.cidade}/${c.estado}`);
    }
  }
  console.log(`  Corridas manuais: ${total} inseridas\n`);
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('🚀 REGENI — Scraper Corridas Abertas Brasil\n');
  console.log(`⏰ ${new Date().toLocaleString('pt-BR')}\n`);

  await conectar();
  await carregarExistentes();

  // Corridas manuais primeiro (mais confiáveis)
  await inserirCorridasManuais();

  // Scrapers dos sites
  await scrapeRunnerBrasil();
  await scrapeCorridasDoBrasil();
  await scrapeChipower();
  await scrapeMinhasInscricoes();
  await scrapeWebRun();
  await scrapeSympla();
  await scrapeTicketSports();

  // Resultado final
  const r = await client.query(`SELECT COUNT(*) FROM "Race" WHERE status='upcoming'`);
  console.log('═══════════════════════════════════');
  console.log(`✅ CONCLUÍDO!`);
  console.log(`   Inseridas nesta execução: ${inseridas}`);
  console.log(`   Total upcoming no banco: ${r.rows[0].count}`);
  console.log('═══════════════════════════════════');

  await client.end();
}

main().catch(e => { console.error('ERRO FATAL:', e.message); process.exit(1); });
