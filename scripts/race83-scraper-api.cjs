#!/usr/bin/env node
/**
 * RACE83 SCRAPER — API JSON + Diretório /resultados
 * Usa a API real do Race83 para buscar corridas e resultados
 */
const https = require('https');
const http = require('http');
const { Client } = require('pg');
const DELAY = ms => new Promise(r => setTimeout(r, ms));

const DB = 'postgresql://postgres:sBbOLYIKlSXCXTnLWnYRUTJVAzLUBhhF@caboose.proxy.rlwy.net:31475/railway';
let client;
let totalRaces = 0;
let totalResults = 0;
let totalAtletas = 0;
const atletasCache = new Map();
const racesExistentes = new Set();

// ═══════════════════════════════════════════
// HTTP
// ═══════════════════════════════════════════
function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120',
        'Accept': 'application/json, text/html, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        ...headers
      },
      timeout: 20000
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        return get(res.headers.location, headers).then(resolve).catch(reject);
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ═══════════════════════════════════════════
// UTILITÁRIOS
// ═══════════════════════════════════════════
function clean(h) {
  return (h||'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#\d+;/g,'').replace(/\s+/g,' ').trim();
}

function uf(t) {
  if (!t) return '';
  const m = (t||'').toUpperCase().match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);
  return m ? m[1] : '';
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

function dists(t) {
  return [...new Set((t.match(/\d+\s*km/gi)||[]).map(m=>m.replace(/\s/g,'').toLowerCase()))].join(',');
}

// ═══════════════════════════════════════════
// DB
// ═══════════════════════════════════════════
async function carregarExistentes() {
  const r = await client.query(`SELECT LOWER(name) as n FROM "Race"`);
  r.rows.forEach(row => racesExistentes.add(row.n));
  console.log(`  📋 ${racesExistentes.size} corridas já no banco`);
}

async function getOuCriarAtleta(nome, genero) {
  if (!nome || nome.length < 2) return null;
  const key = nome.toLowerCase().trim().substring(0,100);
  if (atletasCache.has(key)) return atletasCache.get(key);

  const ex = await client.query(`SELECT id FROM "Athlete" WHERE LOWER(name)=$1 LIMIT 1`, [key]);
  if (ex.rows.length > 0) {
    atletasCache.set(key, ex.rows[0].id);
    return ex.rows[0].id;
  }

  const id = 'at_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2,6);
  await client.query(
    `INSERT INTO "Athlete"(id, name, gender, "createdAt", "updatedAt") VALUES($1,$2,$3,NOW(),NOW()) ON CONFLICT DO NOTHING`,
    [id, nome.substring(0,150), genero || null]
  );
  atletasCache.set(key, id);
  totalAtletas++;
  return id;
}

async function criarOuBuscarRace(nome, data, cidade, estado, dist) {
  if (!nome || nome.length < 3) return null;
  const key = nome.toLowerCase().trim();
  
  if (racesExistentes.has(key)) {
    const ex = await client.query(`SELECT id FROM "Race" WHERE LOWER(name)=$1 LIMIT 1`, [key]);
    return ex.rows[0]?.id || null;
  }

  const id = 'rc_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2,6);
  try {
    await client.query(
      `INSERT INTO "Race"(id, name, date, city, state, distances, organizer, status, "createdAt", "updatedAt")
       VALUES($1,$2,$3,$4,$5,$6,'race83','completed',NOW(),NOW()) ON CONFLICT DO NOTHING`,
      [id, nome.substring(0,200), data || null, (cidade||'').substring(0,100),
       (estado||'').substring(0,2), dist||'']
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

// ═══════════════════════════════════════════
// PASSO 1: API DE EVENTOS (JSON dinâmico por data)
// ═══════════════════════════════════════════
async function buscarEventosAPI() {
  console.log('\n📡 Buscando eventos via API JSON...');
  
  // A URL usa a data atual: /session/YYYYMMDD_race83_events.json
  const hoje = new Date();
  const datas = [];
  // Tenta os últimos 30 dias e próximos 7 (caso mude diariamente)
  for (let i = -30; i <= 7; i++) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + i);
    const str = d.toISOString().substring(0,10).replace(/-/g,'');
    datas.push(str);
  }

  let eventos = [];
  for (const data of datas) {
    try {
      const url = `https://www.race83.com.br/session/${data}_race83_events.json`;
      const { status, body } = await get(url);
      if (status === 200 && body.includes('listEventos')) {
        const json = JSON.parse(body);
        if (json.listEventos && json.listEventos.length > 0) {
          eventos = json.listEventos;
          console.log(`  ✅ Encontrou ${eventos.length} eventos no arquivo ${data}`);
          break;
        }
      }
    } catch(e) {}
  }

  if (eventos.length === 0) {
    console.log('  ⚠️ Nenhum evento encontrado via API');
    return [];
  }

  let inseridos = 0;
  for (const ev of eventos) {
    const nome = ev.eve_nome || '';
    const dataEv = parseData(ev.eve_datahora_fim || ev.eve_data || '');
    const cidade = ev.eve_cidade || '';
    const estado = uf(ev.eve_estado || ev.eve_cidade || nome);
    const dist = dists(nome);
    const link = ev.url_resultado ? `https://www.race83.com.br/${ev.url_resultado}` : '';
    
    await criarOuBuscarRace(nome, dataEv, cidade, estado, dist);
    inseridos++;
  }

  console.log(`  ✅ ${inseridos} eventos processados da API`);
  return eventos;
}

// ═══════════════════════════════════════════
// PASSO 2: DIRETÓRIO /resultados — arquivos .clax e .html
// ═══════════════════════════════════════════
async function listarDiretorioResultados() {
  console.log('\n📂 Listando diretório /resultados...');
  
  const { status, body } = await get('https://race83.com.br/resultados/');
  if (status !== 200) {
    console.log('  ❌ Não conseguiu acessar diretório');
    return [];
  }

  // Extrai todos os arquivos listados
  const arquivos = [];
  const matches = [...body.matchAll(/href="([^"]+\.(clax|html|htm|json|xml))"/gi)];
  for (const m of matches) {
    const nome = m[1];
    if (nome.startsWith('http') || nome === 'Parent Directory') continue;
    arquivos.push({
      nome: decodeURIComponent(nome),
      tipo: m[2].toLowerCase(),
      url: 'https://race83.com.br/resultados/' + nome
    });
  }

  // Também pega subdiretórios
  const dirs = [...body.matchAll(/href="([^"\/]+\/)"/gi)].map(m => m[1]).filter(d => d !== '../');
  console.log(`  📁 ${arquivos.length} arquivos, ${dirs.length} subdiretórios`);
  
  // Processa subdiretórios
  for (const dir of dirs.slice(0, 20)) {
    try {
      const { body: subBody } = await get('https://race83.com.br/resultados/' + dir);
      const subArqs = [...subBody.matchAll(/href="([^"]+\.(clax|html|htm|json|xml))"/gi)];
      for (const m of subArqs) {
        const nome = m[1];
        if (nome.startsWith('http')) continue;
        arquivos.push({
          nome: decodeURIComponent(dir + nome),
          tipo: m[2].toLowerCase(),
          url: 'https://race83.com.br/resultados/' + dir + nome
        });
      }
      await DELAY(200);
    } catch(e) {}
  }

  console.log(`  📋 Total: ${arquivos.length} arquivos de resultado`);
  return arquivos;
}

// Parse de arquivo .clax (formato proprietário do Race83 — é HTML/CSV)
async function processarArquivo(arq) {
  try {
    const { status, body } = await get(arq.url);
    if (status !== 200 || body.length < 100) return 0;

    // Deduz nome da corrida do arquivo
    const nomeArq = arq.nome.replace(/\.(clax|html|htm)$/i, '').replace(/[-_]/g,' ').trim();

    // Tenta extrair título da corrida do conteúdo
    let nomeCorrida = clean(body.match(/<(?:h1|h2|title)[^>]*>(.*?)<\/(?:h1|h2|title)>/i)?.[1] || nomeArq);
    if (nomeCorrida.length < 3) nomeCorrida = nomeArq;

    // Deduz estado
    const estado = uf(nomeCorrida + ' ' + arq.nome) || 'BR';
    const cidade = '';
    const dist = dists(nomeCorrida);

    // Cria ou busca a race
    let raceId = await criarOuBuscarRace(nomeCorrida, null, cidade, estado, dist);
    if (!raceId) {
      const ex = await client.query(`SELECT id FROM "Race" WHERE LOWER(name)=$1 LIMIT 1`, [nomeCorrida.toLowerCase()]);
      raceId = ex.rows[0]?.id;
    }
    if (!raceId) return 0;

    let n = 0;

    // Tenta parse como HTML com tabela
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1]);
    for (const row of rows) {
      const cols = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => clean(m[1]));
      if (cols.length < 2) continue;

      let nomeAtleta = '', time = '', pace = '', rank = null, genero = '', ageGroup = '';

      for (let i = 0; i < cols.length; i++) {
        const c = cols[i].trim();
        if (/^\d+$/.test(c) && parseInt(c) < 10000 && !rank) {
          rank = parseInt(c);
        } else if (c.length >= 4 && /[a-záéíóúâêîôûãõç]/i.test(c) && !/^\d/.test(c) && !nomeAtleta && c.length < 80) {
          nomeAtleta = c;
        } else if (/\d{1,2}:\d{2}:\d{2}/.test(c) && !time) {
          time = c.match(/\d{1,2}:\d{2}:\d{2}/)[0];
        } else if (/\d{1,2}:\d{2}\/km/i.test(c) && !pace) {
          pace = c;
        } else if (/^[MFmf]$/.test(c) && !genero) {
          genero = c.toUpperCase();
        } else if (/^[MF]\d{2}/.test(c) && !ageGroup) {
          ageGroup = c;
        }
      }

      if (!nomeAtleta || nomeAtleta.length < 3 || !time) continue;

      const athleteId = await getOuCriarAtleta(nomeAtleta, genero || null);
      if (!athleteId) continue;

      const ok = await inserirResult(athleteId, raceId, time, pace, rank, null, dist || null, ageGroup || null);
      if (ok) n++;
    }

    // Se não encontrou tabela, tenta CSV
    if (n === 0 && !body.includes('<tr')) {
      const linhas = body.split('\n').filter(l => l.trim().length > 10);
      for (const linha of linhas) {
        const cols = linha.split(/[,;\t|]/).map(c => c.trim().replace(/"/g,''));
        if (cols.length < 3) continue;

        let nomeAtleta = '', time = '', rank = null, genero = '';
        for (const c of cols) {
          if (/^\d+$/.test(c) && parseInt(c) < 10000 && !rank) rank = parseInt(c);
          else if (c.length >= 4 && /[a-záéíóú]/i.test(c) && !nomeAtleta && c.length < 80 && !/^\d/.test(c)) nomeAtleta = c;
          else if (/\d{1,2}:\d{2}:\d{2}/.test(c) && !time) time = c.match(/\d{1,2}:\d{2}:\d{2}/)[0];
          else if (/^[MFmf]$/.test(c) && !genero) genero = c.toUpperCase();
        }

        if (!nomeAtleta || !time) continue;
        const athleteId = await getOuCriarAtleta(nomeAtleta, genero);
        if (!athleteId) continue;
        const ok = await inserirResult(athleteId, raceId, time, null, rank, null, null, null);
        if (ok) n++;
      }
    }

    return n;
  } catch(e) {
    return 0;
  }
}

// ═══════════════════════════════════════════
// PASSO 3: URLs diretas de resultado por evento_id
// ═══════════════════════════════════════════
async function scrapeResultadosPorId(eventos) {
  console.log('\n🏃 Buscando resultados por ID de evento...');
  let total = 0;

  for (const ev of eventos) {
    const eveId = ev.eve_id;
    const urlResultado = ev.url_resultado ? `https://www.race83.com.br/${ev.url_resultado}` : null;
    if (!urlResultado) continue;

    try {
      const { status, body } = await get(urlResultado);
      if (status !== 200 || body.length < 200) continue;

      const nomeCorrida = ev.eve_nome || '';
      const estado = uf(ev.eve_estado || ev.eve_cidade || nomeCorrida);
      const cidade = ev.eve_cidade || '';
      const dataEv = parseData(ev.eve_datahora_fim || '');
      const dist = dists(nomeCorrida);

      let raceId = await criarOuBuscarRace(nomeCorrida, dataEv, cidade, estado, dist);
      if (!raceId) {
        const ex = await client.query(`SELECT id FROM "Race" WHERE LOWER(name)=$1 LIMIT 1`, [nomeCorrida.toLowerCase()]);
        raceId = ex.rows[0]?.id;
      }
      if (!raceId) continue;

      // Extrai links para páginas de resultado por distância
      const linksResultado = [...new Set(
        [...body.matchAll(/href="([^"]*resultado[^"]*|[^"]*result[^"]*)"/gi)]
        .map(m => m[1].startsWith('http') ? m[1] : 'https://www.race83.com.br/' + m[1].replace(/^\//,''))
        .filter(u => u.includes('race83'))
      )];

      // Processa a página principal e sub-páginas
      const paginas = [body];
      for (const link of linksResultado.slice(0, 5)) {
        try {
          const { body: sub } = await get(link);
          paginas.push(sub);
          await DELAY(300);
        } catch(e) {}
      }

      let n = 0;
      for (const pg of paginas) {
        const rows = [...pg.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1]);
        for (const row of rows) {
          const cols = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => clean(m[1]));
          if (cols.length < 3) continue;

          let nomeAtleta = '', time = '', pace = '', rank = null, genero = '', ageGroup = '';
          for (let i = 0; i < cols.length; i++) {
            const c = cols[i].trim();
            if (/^\d+$/.test(c) && parseInt(c) < 50000 && !rank) rank = parseInt(c);
            else if (c.length >= 4 && /[a-záéíóúâêîôûãõç]/i.test(c) && !nomeAtleta && c.length < 100 && !/^\d/.test(c) && !/^(km|m|corrida|prova)/i.test(c)) nomeAtleta = c;
            else if (/\d{1,2}:\d{2}:\d{2}/.test(c) && !time) time = c.match(/\d{1,2}:\d{2}:\d{2}/)[0];
            else if (/\d{1,2}:\d{2}\/km/i.test(c) && !pace) pace = c;
            else if (/^[MFmf]$/.test(c) && !genero) genero = c.toUpperCase();
            else if (/^[MF]\d{2}/i.test(c) && !ageGroup) ageGroup = c.toUpperCase();
          }

          if (!nomeAtleta || nomeAtleta.length < 3 || !time) continue;
          const athleteId = await getOuCriarAtleta(nomeAtleta, genero || null);
          if (!athleteId) continue;
          const ok = await inserirResult(athleteId, raceId, time, pace, rank, null, dist||null, ageGroup||null);
          if (ok) { n++; total++; }
        }
      }

      if (n > 0) process.stdout.write(`\r  ✅ ${nomeCorrida.substring(0,40)}: ${n} resultados | Total: ${total}`);
      await DELAY(400);
    } catch(e) {}
  }

  console.log(`\n  Total resultados por evento: ${total}`);
}

// ═══════════════════════════════════════════
// RELATÓRIO
// ═══════════════════════════════════════════
async function relatorio() {
  console.log('\n═══════════════════════════════════════');
  console.log('           RELATÓRIO FINAL');
  console.log('═══════════════════════════════════════');

  const t = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM "Race") as races,
      (SELECT COUNT(*) FROM "Result") as results,
      (SELECT COUNT(*) FROM "Athlete") as athletes
  `);
  const row = t.rows[0];
  console.log(`\n📊 TOTAIS NO BANCO:`);
  console.log(`  Corridas : ${row.races}`);
  console.log(`  Resultados: ${row.results}`);
  console.log(`  Atletas  : ${row.athletes}`);

  const estados = await client.query(`
    SELECT state, COUNT(*) as corridas,
      (SELECT COUNT(*) FROM "Result" re JOIN "Race" r2 ON re."raceId"=r2.id WHERE r2.state=r.state) as resultados
    FROM "Race" r
    WHERE state IS NOT NULL AND LENGTH(state)=2
    GROUP BY state ORDER BY resultados::int DESC
  `);

  console.log(`\n📍 POR ESTADO:`);
  estados.rows.forEach(e => console.log(`  ${e.state}: ${e.corridas} corridas | ${e.resultados} resultados`));

  console.log(`\n✅ Novas corridas  : ${totalRaces}`);
  console.log(`✅ Novos resultados: ${totalResults}`);
  console.log(`✅ Novos atletas   : ${totalAtletas}`);
  console.log('═══════════════════════════════════════');
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════
async function main() {
  console.log('🚀 RACE83 SCRAPER — API + Diretório');
  console.log(`⏰ ${new Date().toLocaleString('pt-BR')}\n`);

  client = new Client({ connectionString: DB });
  await client.connect();
  console.log('✅ Banco conectado');

  await carregarExistentes();

  // Passo 1: API JSON de eventos
  const eventos = await buscarEventosAPI();

  // Passo 2: Resultados dos eventos via URL direta
  if (eventos.length > 0) {
    await scrapeResultadosPorId(eventos);
  }

  // Passo 3: Diretório /resultados — arquivos .clax e .html
  const arquivos = await listarDiretorioResultados();
  console.log(`\n📄 Processando ${arquivos.length} arquivos de resultado...`);
  
  let processados = 0;
  for (const arq of arquivos) {
    const n = await processarArquivo(arq);
    processados++;
    if (n > 0 || processados % 10 === 0) {
      process.stdout.write(`\r  Arquivo ${processados}/${arquivos.length} | +${totalResults} resultados total`);
    }
    await DELAY(200);
  }

  await relatorio();
  await client.end();
  console.log('\n✅ Concluído!');
}

main().catch(e => {
  console.error('ERRO FATAL:', e.message);
  client?.end();
  process.exit(1);
});
