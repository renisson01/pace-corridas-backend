#!/usr/bin/env node
/**
 * Busca resultados de um atleta em múltiplos sites de corrida brasileiros.
 *
 * USO:
 *   node scripts/buscar-atleta-web.cjs
 *   node scripts/buscar-atleta-web.cjs "OUTRO ATLETA NOME"
 */

'use strict';

const https = require('https');
const http  = require('http');

const ATLETA = (process.argv[2] || 'RENISSON NASCIMENTO ARAGAO').toUpperCase().trim();
const DELAY  = ms => new Promise(r => setTimeout(r, ms));

const HEADERS = {
  'User-Agent'     : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept'         : 'application/json, text/html, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Accept-Encoding': 'identity',
};

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function fetchRaw(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const options = {
      method : opts.method || 'GET',
      headers: { ...HEADERS, ...opts.headers },
      rejectUnauthorized: false,
      timeout: 15000,
    };
    const req = lib.request(url, options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status : res.statusCode,
        headers: res.headers,
        body   : Buffer.concat(chunks).toString('utf-8'),
      }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function postForm(url, params, extra = {}) {
  const body = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return fetchRaw(url, {
    method: 'POST',
    headers: {
      'Content-Type'  : 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
      ...extra,
    },
    body,
  });
}

function normalizeNome(s = '') {
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function matchAtleta(nomeRaw) {
  const n = normalizeNome(nomeRaw);
  const partes = ATLETA.split(' ').filter(p => p.length > 2);
  return partes.every(p => n.includes(p));
}

// ─── 1. CENTRAL DE RESULTADOS ────────────────────────────────────────────────

async function buscarCentralDeResultados() {
  const SITE = 'centralderesultados.com.br';
  const BASE  = 'https://centralderesultados.com.br';
  const resultados = [];

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[1/5] ${SITE}`);

  try {
    // Coleta eventos recentes (2020-2025)
    const eventos = [];
    for (const ano of ['2025','2024','2023','2022','2021','2020']) {
      for (let p = 1; p <= 20; p++) {
        try {
          const r = await postForm(`${BASE}/resultados/buscar-resultado`, {
            txt: '', cidade: '', data: ano, vData: '', nrPagina: p,
          });
          const j = JSON.parse(r.body);
          if (!j.success || !j.data?.length) break;
          eventos.push(...j.data);
          if (j.data.length < 10) break;
          await DELAY(120);
        } catch { break; }
      }
    }
    process.stdout.write(`   ${eventos.length} eventos indexados, buscando atleta...\r`);

    // Busca atleta dentro de cada evento
    for (let i = 0; i < eventos.length; i++) {
      const ev = eventos[i];
      process.stdout.write(`   Evento ${i+1}/${eventos.length}…\r`);
      try {
        // Busca na primeira página com o primeiro nome
        const primeiroNome = ATLETA.split(' ')[0];
        const r = await postForm(`${BASE}/resultados/buscar-resultado-evento`, {
          evento        : ev.numg_evento,
          evento_empresa: '',
          genero        : '',
          distancia     : 0,
          categoria     : '',
          nome          : primeiroNome,
          nrPagina      : 1,
        });
        const j = JSON.parse(r.body);
        if (!j.success || !j.data?.length) { await DELAY(80); continue; }

        for (const row of j.data) {
          const nome = row.ds_nome || row.nome_atleta || '';
          if (!matchAtleta(nome)) continue;
          const ano = (ev.data_evento || '').substring(0, 4) || '?';
          resultados.push({
            site    : SITE,
            corrida : ev.nome_evento || ev.desc_local || '?',
            ano,
            distancia: row.distancia || '?',
            tempo   : row.tempo_oficial || row.tempo_total || '?',
            posicao : row.colocacao || '?',
            extra   : `${row.ds_genero || ''} | ${row.ds_categoria || ''}`.trim().replace(/^\||\|$/g,''),
          });
        }
        await DELAY(80);
      } catch { await DELAY(200); }
    }
  } catch (e) {
    console.log(`   Erro geral: ${e.message}`);
  }

  return resultados;
}

// ─── 2. RUNNER BRASIL ────────────────────────────────────────────────────────

async function buscarRunnerBrasil() {
  const SITE = 'runnerbrasil.com.br';
  const BASE  = 'https://www.runnerbrasil.com.br';
  const resultados = [];

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[2/5] ${SITE}`);

  try {
    // Listando eventos por ano
    const eventos = [];
    for (const ano of ['2025','2024','2023','2022','2021','2020']) {
      try {
        const r = await fetchRaw(`${BASE}/Views/Runner/Runner_Resultados.aspx?idAno=${ano}`);
        const matches = [...r.body.matchAll(/idEvento=(\d+)[^"]*idAno=(\d+)/g)];
        const nomes   = [...r.body.matchAll(/font-weight:bold.*?>(.*?)<\/td>/gs)];

        const nomesLimpos = nomes
          .map(m => m[1].replace(/<[^>]+>/g, '').trim())
          .filter(s => s.length > 3);

        matches.forEach((m, idx) => {
          if (!eventos.find(e => e.id === m[1])) {
            eventos.push({ id: m[1], ano: m[2], nome: nomesLimpos[idx * 2] || '', local: nomesLimpos[idx * 2 + 1] || '' });
          }
        });
        await DELAY(300);
      } catch { continue; }
    }
    process.stdout.write(`   ${eventos.length} eventos indexados, buscando atleta...\r`);

    // Busca atleta em cada evento (página de resultados)
    for (let i = 0; i < eventos.length; i++) {
      const ev = eventos[i];
      process.stdout.write(`   Evento ${i+1}/${eventos.length}…\r`);
      try {
        const r = await fetchRaw(
          `${BASE}/Views/Runner/Runner_ResultadosDetalhe.aspx?idEvento=${ev.id}&idAno=${ev.ano}`
        );
        if (!r.body.includes(ATLETA.split(' ')[0]) && !r.body.toUpperCase().includes('RENISSON')) {
          await DELAY(150);
          continue;
        }
        // Encontrou — extrai linhas da tabela
        const rows = [...r.body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gsi)];
        for (const row of rows) {
          const cells = [...row[1].matchAll(/<td[^>]*>(.*?)<\/td>/gsi)]
            .map(c => c[1].replace(/<[^>]+>/g, '').trim());
          const nomeCelula = cells.find(c => matchAtleta(c));
          if (!nomeCelula) continue;
          resultados.push({
            site    : SITE,
            corrida : ev.nome || `Evento ${ev.id}`,
            ano     : ev.ano,
            distancia: cells.find(c => /\d+\s*[Kk][Mm]?/.test(c)) || '?',
            tempo   : cells.find(c => /\d{1,2}:\d{2}:\d{2}/.test(c)) || '?',
            posicao : cells[0] || '?',
            extra   : '',
          });
        }
        await DELAY(200);
      } catch { await DELAY(300); }
    }
  } catch (e) {
    console.log(`   Erro geral: ${e.message}`);
  }

  return resultados;
}

// ─── 3. CORRIDAS DO BRASIL ───────────────────────────────────────────────────

async function buscarCorridasDoBrasil() {
  const SITE = 'corridasdobrasil.com.br';
  const BASE  = 'https://www.corridasdobrasil.com.br';
  const resultados = [];

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[3/5] ${SITE}`);

  try {
    // Tentativa 1: endpoint de busca de atleta via API JSON
    const candidatos = [
      `/api/resultados/atleta?nome=${encodeURIComponent(ATLETA)}`,
      `/resultados/buscar?atleta=${encodeURIComponent(ATLETA)}`,
      `/resultados/atleta/${encodeURIComponent(ATLETA)}`,
    ];

    let encontrou = false;
    for (const path of candidatos) {
      try {
        const r = await fetchRaw(`${BASE}${path}`);
        if (r.status === 200 && r.body.includes('{')) {
          const j = JSON.parse(r.body);
          const dados = j.data || j.resultados || j.results || (Array.isArray(j) ? j : []);
          for (const row of dados) {
            const nome = row.nome || row.atleta || row.name || '';
            if (!matchAtleta(nome)) continue;
            resultados.push({
              site    : SITE,
              corrida : row.corrida || row.evento || row.race || '?',
              ano     : (row.data || row.ano || '').toString().substring(0, 4) || '?',
              distancia: row.distancia || row.distance || '?',
              tempo   : row.tempo || row.time || '?',
              posicao : row.posicao || row.colocacao || row.position || '?',
              extra   : '',
            });
          }
          encontrou = true;
          break;
        }
      } catch { continue; }
    }

    if (!encontrou) {
      // Tentativa 2: busca HTML na página de resultados
      const r = await fetchRaw(`${BASE}/resultados`);
      if (r.status === 200) {
        // Verifica se tem menção ao atleta na página principal
        if (r.body.toUpperCase().includes('RENISSON')) {
          const rows = [...r.body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gsi)];
          for (const row of rows) {
            const cells = [...row[1].matchAll(/<td[^>]*>(.*?)<\/td>/gsi)]
              .map(c => c[1].replace(/<[^>]+>/g, '').trim());
            if (!cells.some(c => matchAtleta(c))) continue;
            resultados.push({
              site    : SITE,
              corrida : cells[1] || '?',
              ano     : '?',
              distancia: cells.find(c => /\d+[Kk]/.test(c)) || '?',
              tempo   : cells.find(c => /\d{1,2}:\d{2}/.test(c)) || '?',
              posicao : cells[0] || '?',
              extra   : '',
            });
          }
        } else {
          console.log('   Atleta não encontrado na página de resultados.');
        }
      }
    }
  } catch (e) {
    console.log(`   Erro geral: ${e.message}`);
  }

  return resultados;
}

// ─── 4. CHIPPOWER ────────────────────────────────────────────────────────────

async function buscarChipPower() {
  const SITE = 'chipower.com.br';
  const BASE  = 'https://www.chipower.com.br';
  const resultados = [];

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[4/5] ${SITE}`);

  try {
    // ChipPower usa portal de resultados com API própria
    const endpoints = [
      `/api/resultados?nome=${encodeURIComponent(ATLETA)}`,
      `/portal/resultados/atleta?nome=${encodeURIComponent(ATLETA)}`,
      `/resultados/atleta?nome=${encodeURIComponent(ATLETA)}`,
    ];

    let encontrou = false;
    for (const path of endpoints) {
      try {
        const r = await fetchRaw(`${BASE}${path}`);
        if (r.status === 200 && r.body.includes('{')) {
          const j = JSON.parse(r.body);
          const dados = j.data || j.resultados || (Array.isArray(j) ? j : []);
          for (const row of dados) {
            const nome = row.nome || row.atleta || row.name || '';
            if (!matchAtleta(nome)) continue;
            resultados.push({
              site    : SITE,
              corrida : row.corrida || row.evento || row.race || '?',
              ano     : (row.data || row.ano || '').toString().substring(0, 4) || '?',
              distancia: row.distancia || row.distance || '?',
              tempo   : row.tempo || row.time || '?',
              posicao : row.posicao || row.position || '?',
              extra   : '',
            });
          }
          encontrou = true;
          break;
        }
      } catch { continue; }
    }

    if (!encontrou) {
      // Tenta busca HTML
      try {
        const r = await fetchRaw(`${BASE}/resultados`);
        if (r.status === 200 && r.body.toUpperCase().includes('RENISSON')) {
          const rows = [...r.body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gsi)];
          for (const row of rows) {
            const cells = [...row[1].matchAll(/<td[^>]*>(.*?)<\/td>/gsi)]
              .map(c => c[1].replace(/<[^>]+>/g, '').trim());
            if (!cells.some(c => matchAtleta(c))) continue;
            resultados.push({
              site    : SITE,
              corrida : cells[1] || '?',
              ano     : '?',
              distancia: cells.find(c => /\d+[Kk]/.test(c)) || '?',
              tempo   : cells.find(c => /\d{1,2}:\d{2}/.test(c)) || '?',
              posicao : cells[0] || '?',
              extra   : '',
            });
          }
        } else if (r.status !== 200) {
          console.log(`   HTTP ${r.status} — site pode estar fora do ar.`);
        } else {
          console.log('   Atleta não encontrado na listagem pública.');
        }
      } catch (e) {
        console.log(`   Não foi possível acessar: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`   Erro geral: ${e.message}`);
  }

  return resultados;
}

// ─── 5. RACE83 ───────────────────────────────────────────────────────────────

async function buscarRace83() {
  const SITE = 'race83.com.br';
  const BASE  = 'https://race83.com.br';
  const resultados = [];

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[5/5] ${SITE}`);

  try {
    // Race83 serve arquivos .clax (XML) por evento.
    // Primeiro tentamos a listagem de eventos via API ou HTML.
    const listaPaths = [
      '/resultados',
      '/api/eventos',
      '/api/resultados',
    ];

    let eventosXml = [];

    for (const path of listaPaths) {
      try {
        const r = await fetchRaw(`${BASE}${path}`);
        if (r.status !== 200) continue;

        // Extrai links para .clax
        const claxLinks = [...r.body.matchAll(/href="([^"]*\.clax)"/gi)].map(m => m[1]);
        const claxAbsolutos = claxLinks.map(l => l.startsWith('http') ? l : `${BASE}${l}`);
        eventosXml.push(...claxAbsolutos);

        // Extrai links para páginas de eventos
        const evLinks = [...r.body.matchAll(/href="([^"]*\/resultados\/evento[^"]*)"/gi)].map(m => m[1]);
        const evAbsolutos = evLinks.map(l => l.startsWith('http') ? l : `${BASE}${l}`);

        // Tenta encontrar .clax dentro de cada página de evento
        for (const evUrl of evAbsolutos.slice(0, 30)) {
          try {
            const ev = await fetchRaw(evUrl);
            const links = [...ev.body.matchAll(/href="([^"]*\.clax)"/gi)].map(m => m[1]);
            eventosXml.push(...links.map(l => l.startsWith('http') ? l : `${BASE}${l}`));
            await DELAY(200);
          } catch { continue; }
        }

        if (eventosXml.length > 0) break;
      } catch { continue; }
    }

    // Deduplication
    eventosXml = [...new Set(eventosXml)];
    console.log(`   ${eventosXml.length} arquivos .clax encontrados`);

    // Parseia cada .clax e busca atleta
    for (let i = 0; i < eventosXml.length; i++) {
      const url = eventosXml[i];
      process.stdout.write(`   Arquivo ${i+1}/${eventosXml.length}…\r`);
      try {
        const r = await fetchRaw(url);
        if (r.status !== 200) continue;
        const xml = r.body;

        // Extrai nome do evento
        const evtMatch = xml.match(/nom="([^"]+)"/);
        const evtNome = evtMatch ? evtMatch[1] : url.split('/').pop().replace('.clax','');

        // Extrai ano do URL ou XML
        const anoMatch = url.match(/\/(\d{4})\//);
        const ano = anoMatch ? anoMatch[1] : '?';

        // Verifica se atleta está no arquivo
        if (!xml.toUpperCase().includes('RENISSON')) { await DELAY(100); continue; }

        // Parse <E> (atletas) e <R> (resultados)
        const athMap = {};
        for (const tag of (xml.match(/<E [^>]+\/>/g) || [])) {
          const get = name => { const m = tag.match(new RegExp(`${name}="([^"]*)"`)); return m ? m[1] : null; };
          const doss = get('d');
          if (doss) athMap[doss] = {
            nome    : (get('n') || '').toUpperCase().trim(),
            parcours: get('p') || '',
          };
        }
        const resMap = {};
        for (const tag of (xml.match(/<R [^>]+\/>/g) || [])) {
          const get = name => { const m = tag.match(new RegExp(`${name}="([^"]*)"`)); return m ? m[1] : null; };
          const doss = get('d');
          if (doss) resMap[doss] = { tempo: get('t'), pos: get('cl') || get('cp') || get('rank') };
        }

        for (const [doss, ath] of Object.entries(athMap)) {
          if (!matchAtleta(ath.nome)) continue;
          const res = resMap[doss] || {};
          const rawTime = res.tempo || '';
          // Converte "00h25'26,000" → "00:25:26"
          const timeM = rawTime.match(/(\d+)h(\d+)'(\d+)/);
          const tempo  = timeM ? `${timeM[1].padStart(2,'0')}:${timeM[2].padStart(2,'0')}:${timeM[3].padStart(2,'0')}` : rawTime;
          const dist   = normalizarDistancia(ath.parcours);
          resultados.push({
            site    : SITE,
            corrida : evtNome,
            ano,
            distancia: dist,
            tempo,
            posicao : res.pos || '?',
            extra   : '',
          });
        }
        await DELAY(150);
      } catch { await DELAY(300); }
    }
  } catch (e) {
    console.log(`   Erro geral: ${e.message}`);
  }

  return resultados;
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function normalizarDistancia(s = '') {
  const u = s.toUpperCase();
  if (u.includes('MARATONA') && !u.includes('MEIA')) return '42K';
  if (u.includes('MEIA') || u.includes('21')) return '21K';
  if (u.includes('15')) return '15K';
  if (u.includes('10')) return '10K';
  if (u.includes('5'))  return '5K';
  if (u.includes('3'))  return '3K';
  return s || '?';
}

function printTabela(resultados) {
  if (!resultados.length) { console.log('   (nenhum resultado encontrado)'); return; }

  const col = (s, n) => String(s ?? '').substring(0, n).padEnd(n);
  const header = `${'CORRIDA'.padEnd(42)} ${'DIST'.padEnd(6)} ${'TEMPO'.padEnd(10)} ${'POS'.padEnd(6)} ${'ANO'.padEnd(5)} SITE`;
  console.log('\n' + header);
  console.log('─'.repeat(header.length + 10));

  for (const r of resultados) {
    console.log(
      `${col(r.corrida, 42)} ${col(r.distancia, 6)} ${col(r.tempo, 10)} ${col(r.posicao, 6)} ${col(r.ano, 5)} ${r.site}`
    );
    if (r.extra) console.log(`   ${' '.repeat(42)} ${r.extra}`);
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log(`PACE — Busca de Atleta na Web`);
  console.log(`Atleta : ${ATLETA}`);
  console.log(`Data   : ${new Date().toLocaleDateString('pt-BR')}`);
  console.log('='.repeat(60));

  const [r1, r2, r3, r4, r5] = await Promise.allSettled([
    buscarCentralDeResultados(),
    buscarRunnerBrasil(),
    buscarCorridasDoBrasil(),
    buscarChipPower(),
    buscarRace83(),
  ]).then(res => res.map(r => r.status === 'fulfilled' ? r.value : []));

  const todos = [...r1, ...r2, ...r3, ...r4, ...r5];

  console.log('\n\n' + '='.repeat(60));
  console.log(`RESULTADOS ENCONTRADOS — ${ATLETA}`);
  console.log('='.repeat(60));

  if (!todos.length) {
    console.log('\nNenhum resultado encontrado nos sites consultados.');
  } else {
    // Agrupa por site
    const porSite = {};
    for (const r of todos) {
      porSite[r.site] = porSite[r.site] || [];
      porSite[r.site].push(r);
    }
    for (const [site, lista] of Object.entries(porSite)) {
      console.log(`\n[${site}] — ${lista.length} resultado(s)`);
      printTabela(lista.sort((a, b) => (b.ano || '0').localeCompare(a.ano || '0')));
    }
    console.log(`\nTOTAL: ${todos.length} resultado(s) em ${Object.keys(porSite).length} site(s).`);
  }

  // Resumo por site
  console.log('\n' + '─'.repeat(60));
  console.log('Resumo por site:');
  for (const [site, dados] of [
    ['centralderesultados.com.br', r1],
    ['runnerbrasil.com.br'        , r2],
    ['corridasdobrasil.com.br'    , r3],
    ['chipower.com.br'            , r4],
    ['race83.com.br'              , r5],
  ]) {
    const status = dados.length > 0 ? `✅ ${dados.length} resultado(s)` : '— não encontrado';
    console.log(`  ${site.padEnd(32)} ${status}`);
  }
  console.log('');
}

main().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
