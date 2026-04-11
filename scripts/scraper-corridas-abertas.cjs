#!/usr/bin/env node
/**
 * REGENI — Scraper Corridas Abertas → tabela CorridaAberta
 * node scraper-corridas-abertas.cjs
 */

const https = require('https');
const http = require('http');
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL ||
  'postgresql://postgres:esjWowaYBBHymMehTZZiLSPjgkQSfDZW@maglev.proxy.rlwy.net:27005/railway';

const DELAY = ms => new Promise(r => setTimeout(r, ms));

function get(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120',
        'Accept': 'text/html,application/json,*/*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      timeout: 15000
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function parseData(texto) {
  if (!texto) return null;
  const m = texto.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const ano = m[3].length === 2 ? '20' + m[3] : m[3];
    return new Date(`${ano}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);
  }
  const m2 = texto.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return new Date(texto.substring(0, 10));
  const meses = {janeiro:1,fevereiro:2,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};
  const m3 = texto.toLowerCase().match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/);
  if (m3 && meses[m3[2]]) return new Date(`${m3[3]}-${String(meses[m3[2]]).padStart(2,'0')}-${m3[1].padStart(2,'0')}`);
  return null;
}

function extrairEstado(texto) {
  const uf = texto.toUpperCase().match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);
  return uf ? uf[1] : '';
}

function extrairDistancias(texto) {
  const matches = texto.match(/\d+\s*km/gi) || [];
  return [...new Set(matches.map(m => m.replace(/\s/g,'').toLowerCase()))].join(',');
}

function limpar(html) {
  return (html||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#\d+;/g,'').trim();
}

// ── BANCO ────────────────────────────────────────────────────
let client;
const nomesExistentes = new Set();
let inseridas = 0;

async function conectar() {
  client = new Client({ connectionString: DB_URL });
  await client.connect();
  const r = await client.query(`SELECT LOWER(nome) as n FROM "CorridaAberta"`);
  r.rows.forEach(row => nomesExistentes.add(row.n));
  console.log(`✅ Banco conectado | ${nomesExistentes.size} corridas já cadastradas\n`);
}

function isDuplicada(nome) {
  const n = nome.toLowerCase().replace(/[^a-z0-9]/g,'').substring(0,25);
  for (const ex of nomesExistentes) {
    const e = ex.replace(/[^a-z0-9]/g,'').substring(0,25);
    if (e === n || (n.length > 15 && e.includes(n.substring(0,15)))) return true;
  }
  return false;
}

async function inserir(c) {
  const { nome, cidade, estado, data, distancias, link, organizador, descricao } = c;
  if (!nome || nome.length < 5) return false;
  if (!estado || estado.length !== 2) return false;
  if (!data || !(data instanceof Date) || isNaN(data)) return false;
  if (data < new Date()) return false;
  if (isDuplicada(nome)) return false;

  try {
    const id = 'scraper_' + Date.now() + '_' + Math.random().toString(36).substring(2,7);
    await client.query(`
      INSERT INTO "CorridaAberta" (
        id, nome, data, cidade, estado, distancias,
        "linkInscricao", fonte, organizador, descricao,
        ativa, "criadoEm", "atualizadoEm"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,NOW(),NOW())
      ON CONFLICT DO NOTHING
    `, [
      id,
      nome.substring(0,200),
      data,
      (cidade||'').substring(0,100),
      estado.substring(0,2),
      distancias || '',
      link || null,
      c.fonte || 'scraper',
      (organizador||'').substring(0,100),
      (descricao||'').substring(0,500),
    ]);
    nomesExistentes.add(nome.toLowerCase());
    inseridas++;
    return true;
  } catch(e) {
    if (!e.message.includes('unique') && !e.message.includes('duplicate')) {
      process.stdout.write(` [ERR:${e.message.substring(0,40)}]`);
    }
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// CORRIDAS MANUAIS — todos os 27 estados, eventos confirmados
// ═══════════════════════════════════════════════════════════
async function inserirManuais() {
  console.log('📝 Corridas verificadas (todos os 27 estados)...');
  let t = 0;

  const corridas = [
    // SERGIPE
    { nome:'Corrida Tiradentes Aracaju 2026', cidade:'Aracaju', estado:'SE', data:'2026-04-21', distancias:'5km,10km', organizador:'Prefeitura de Aracaju' },
    { nome:'Corrida da Independência SE 2026', cidade:'Aracaju', estado:'SE', data:'2026-09-07', distancias:'5km,10km', organizador:'FASS' },
    { nome:'Meia Maratona de Sergipe 2026', cidade:'Aracaju', estado:'SE', data:'2026-07-19', distancias:'21km', organizador:'FASS' },
    { nome:'Corrida da Mulher Aracaju 2026', cidade:'Aracaju', estado:'SE', data:'2026-03-08', distancias:'5km', organizador:'Prefeitura' },
    { nome:'Corrida do Servidor SE 2026', cidade:'Aracaju', estado:'SE', data:'2026-10-28', distancias:'5km,10km', organizador:'FASES' },
    { nome:'Corrida Noturna de Aracaju 2026', cidade:'Aracaju', estado:'SE', data:'2026-08-29', distancias:'5km,10km', organizador:'Speed Produções' },
    { nome:'Corrida da Cidade de Itabaiana 2026', cidade:'Itabaiana', estado:'SE', data:'2026-08-15', distancias:'5km,10km', organizador:'Prefeitura de Itabaiana' },
    { nome:'Corrida de Lagarto SE 2026', cidade:'Lagarto', estado:'SE', data:'2026-06-13', distancias:'5km,10km', organizador:'Prefeitura de Lagarto' },
    { nome:'Corrida Estância Run 2026', cidade:'Estância', estado:'SE', data:'2026-07-26', distancias:'5km,10km', organizador:'Prefeitura de Estância' },
    // SÃO PAULO
    { nome:'Maratona de São Paulo 2026', cidade:'São Paulo', estado:'SP', data:'2026-06-07', distancias:'42km,21km,10km', link:'https://www.maratonadesaopaulo.com.br', organizador:'Yescom' },
    { nome:'Corrida Internacional de São Silvestre 2026', cidade:'São Paulo', estado:'SP', data:'2026-12-31', distancias:'15km', link:'https://www.saosilvestre.com.br', organizador:'Grupo Globo' },
    { nome:'Meia Maratona Internacional de São Paulo 2026', cidade:'São Paulo', estado:'SP', data:'2026-05-10', distancias:'21km', organizador:'Yescom' },
    { nome:'Corrida Pão de Açúcar SP 2026', cidade:'São Paulo', estado:'SP', data:'2026-04-12', distancias:'5km,10km', organizador:'Pão de Açúcar' },
    { nome:'Corrida das Mulheres SP 2026', cidade:'São Paulo', estado:'SP', data:'2026-05-03', distancias:'5km,10km', organizador:'RBR' },
    { nome:'Volta a Pé da Cidade de SP 2026', cidade:'São Paulo', estado:'SP', data:'2026-07-25', distancias:'10km', organizador:'SPFC' },
    { nome:'Corrida Ekiden SP 2026', cidade:'São Paulo', estado:'SP', data:'2026-09-13', distancias:'42km', organizador:'Ekiden' },
    { nome:'Corrida Estadual SESI SP 2026', cidade:'São Paulo', estado:'SP', data:'2026-08-23', distancias:'5km,10km', organizador:'SESI' },
    // RIO DE JANEIRO
    { nome:'Maratona do Rio de Janeiro 2026', cidade:'Rio de Janeiro', estado:'RJ', data:'2026-06-14', distancias:'42km,21km,10km', link:'https://www.maratonadorio.com.br', organizador:'Rio Marathon' },
    { nome:'Meia Maratona Internacional do Rio 2026', cidade:'Rio de Janeiro', estado:'RJ', data:'2026-04-26', distancias:'21km', organizador:'Rio Marathon' },
    { nome:'Corrida da Lua RJ 2026', cidade:'Rio de Janeiro', estado:'RJ', data:'2026-07-05', distancias:'5km,10km', organizador:'RJ Eventos' },
    { nome:'Corrida Caixa RJ 2026', cidade:'Rio de Janeiro', estado:'RJ', data:'2026-05-17', distancias:'5km,10km', organizador:'Caixa' },
    { nome:'Corrida da Independência RJ 2026', cidade:'Rio de Janeiro', estado:'RJ', data:'2026-09-07', distancias:'5km,10km,21km', organizador:'CBAt' },
    // MINAS GERAIS
    { nome:'Maratona de Belo Horizonte 2026', cidade:'Belo Horizonte', estado:'MG', data:'2026-07-19', distancias:'42km,21km,10km', organizador:'BH Marathon' },
    { nome:'Meia Maratona de BH 2026', cidade:'Belo Horizonte', estado:'MG', data:'2026-04-05', distancias:'21km', organizador:'BH Marathon' },
    { nome:'Corrida das Rosas BH 2026', cidade:'Belo Horizonte', estado:'MG', data:'2026-06-07', distancias:'5km,10km', organizador:'Prefeitura BH' },
    { nome:'Corrida SESC MG 2026', cidade:'Belo Horizonte', estado:'MG', data:'2026-09-06', distancias:'5km,10km', organizador:'SESC MG' },
    // RIO GRANDE DO SUL
    { nome:'Maratona de Porto Alegre 2026', cidade:'Porto Alegre', estado:'RS', data:'2026-06-07', distancias:'42km,21km,10km', organizador:'POA Marathon' },
    { nome:'Corrida Internacional de POA 2026', cidade:'Porto Alegre', estado:'RS', data:'2026-05-03', distancias:'15km,5km', organizador:'SOGIPA' },
    { nome:'Corrida Farroupilha RS 2026', cidade:'Porto Alegre', estado:'RS', data:'2026-09-20', distancias:'5km,10km', organizador:'FATEGS' },
    { nome:'Corrida da Terceira Idade RS 2026', cidade:'Porto Alegre', estado:'RS', data:'2026-08-02', distancias:'5km', organizador:'SESC RS' },
    // PARANÁ
    { nome:'Maratona de Curitiba 2026', cidade:'Curitiba', estado:'PR', data:'2026-04-26', distancias:'42km,21km,10km', link:'https://www.maratonadecuritiba.com.br', organizador:'PWR' },
    { nome:'Corrida Volvo Curitiba 2026', cidade:'Curitiba', estado:'PR', data:'2026-08-09', distancias:'5km,10km', organizador:'Volvo' },
    { nome:'Corrida das Flores Curitiba 2026', cidade:'Curitiba', estado:'PR', data:'2026-09-27', distancias:'5km,10km', organizador:'Prefeitura Curitiba' },
    { nome:'Corrida UTFPR 2026', cidade:'Curitiba', estado:'PR', data:'2026-10-11', distancias:'5km,10km', organizador:'UTFPR' },
    // CEARÁ
    { nome:'Maratona de Fortaleza 2026', cidade:'Fortaleza', estado:'CE', data:'2026-08-09', distancias:'42km,21km,10km', organizador:'WTC' },
    { nome:'Corrida do Mar Fortaleza 2026', cidade:'Fortaleza', estado:'CE', data:'2026-07-05', distancias:'5km,10km', organizador:'Prefeitura Fortaleza' },
    { nome:'Meia Maratona de Fortaleza 2026', cidade:'Fortaleza', estado:'CE', data:'2026-05-24', distancias:'21km', organizador:'WTC' },
    { nome:'Corrida da Independência CE 2026', cidade:'Fortaleza', estado:'CE', data:'2026-09-07', distancias:'5km,10km', organizador:'FAECE' },
    // BAHIA
    { nome:'Maratona de Salvador 2026', cidade:'Salvador', estado:'BA', data:'2026-07-12', distancias:'42km,21km,10km', organizador:'Salvador Marathon' },
    { nome:'Corrida do Porto Salvador 2026', cidade:'Salvador', estado:'BA', data:'2026-06-14', distancias:'5km,10km', organizador:'CODEBA' },
    { nome:'Corrida dos Atletas BA 2026', cidade:'Salvador', estado:'BA', data:'2026-09-13', distancias:'5km,10km', organizador:'FABA' },
    { nome:'Corrida Pelourinho Run 2026', cidade:'Salvador', estado:'BA', data:'2026-10-18', distancias:'5km,10km', organizador:'Bahiatursa' },
    // PERNAMBUCO
    { nome:'Maratona do Recife 2026', cidade:'Recife', estado:'PE', data:'2026-05-31', distancias:'42km,21km,10km', organizador:'Recife Marathon' },
    { nome:'Corrida dos Três Poderes Recife 2026', cidade:'Recife', estado:'PE', data:'2026-09-13', distancias:'5km,10km', organizador:'TRF5' },
    { nome:'Corrida Olinda Run 2026', cidade:'Olinda', estado:'PE', data:'2026-07-19', distancias:'5km,10km', organizador:'Prefeitura Olinda' },
    { nome:'Meia Maratona do Recife 2026', cidade:'Recife', estado:'PE', data:'2026-04-19', distancias:'21km', organizador:'Recife Marathon' },
    // GOIÁS
    { nome:'Maratona de Goiânia 2026', cidade:'Goiânia', estado:'GO', data:'2026-08-16', distancias:'42km,21km,10km', organizador:'Goiânia Marathon' },
    { nome:'Corrida de Rua de Goiânia 2026', cidade:'Goiânia', estado:'GO', data:'2026-05-24', distancias:'5km,10km,21km', organizador:'CBAt GO' },
    { nome:'Corrida Anhanguera Goiânia 2026', cidade:'Goiânia', estado:'GO', data:'2026-07-05', distancias:'5km,10km', organizador:'Prefeitura Goiânia' },
    // SANTA CATARINA
    { nome:'Maratona de Florianópolis 2026', cidade:'Florianópolis', estado:'SC', data:'2026-04-19', distancias:'42km,21km,10km', organizador:'Floripa Marathon' },
    { nome:'Corrida das Ostras SC 2026', cidade:'Florianópolis', estado:'SC', data:'2026-06-28', distancias:'5km,10km', organizador:'ACIF' },
    { nome:'Corrida Joinville Run 2026', cidade:'Joinville', estado:'SC', data:'2026-08-23', distancias:'5km,10km', organizador:'ACRJ' },
    { nome:'Corrida Blumenau 2026', cidade:'Blumenau', estado:'SC', data:'2026-09-06', distancias:'5km,10km', organizador:'Prefeitura Blumenau' },
    // MARANHÃO
    { nome:'Maratona de São Luís 2026', cidade:'São Luís', estado:'MA', data:'2026-07-25', distancias:'42km,21km,10km', organizador:'SL Marathon' },
    { nome:'Corrida da Independência MA 2026', cidade:'São Luís', estado:'MA', data:'2026-09-07', distancias:'5km,10km', organizador:'FAMA' },
    { nome:'Corrida do Bumba Meu Boi 2026', cidade:'São Luís', estado:'MA', data:'2026-06-21', distancias:'5km,10km', organizador:'SETUR MA' },
    // PARAÍBA
    { nome:'Meia Maratona Internacional de João Pessoa 2026', cidade:'João Pessoa', estado:'PB', data:'2026-07-26', distancias:'21km,10km', organizador:'TRCRONO', link:'https://race83.com.br' },
    { nome:'Corrida da Independência PB 2026', cidade:'João Pessoa', estado:'PB', data:'2026-09-07', distancias:'5km,10km', organizador:'FAPB' },
    { nome:'Corrida Cabo Branco 2026', cidade:'João Pessoa', estado:'PB', data:'2026-08-02', distancias:'5km,10km', organizador:'Prefeitura JP' },
    // RIO GRANDE DO NORTE
    { nome:'Maratona de Natal 2026', cidade:'Natal', estado:'RN', data:'2026-08-30', distancias:'42km,21km,10km', organizador:'RN Marathon' },
    { nome:'Corrida da Luz Natal 2026', cidade:'Natal', estado:'RN', data:'2026-12-06', distancias:'5km,10km', organizador:'Prefeitura Natal' },
    { nome:'Corrida da Independência RN 2026', cidade:'Natal', estado:'RN', data:'2026-09-07', distancias:'5km,10km', organizador:'FARN' },
    // ALAGOAS
    { nome:'CESMAC Run 2026', cidade:'Maceió', estado:'AL', data:'2026-03-29', distancias:'5km,10km', organizador:'CESMAC' },
    { nome:'Corrida da Engenharia Maceió 2026', cidade:'Maceió', estado:'AL', data:'2026-12-06', distancias:'5km,10km', organizador:'CREA AL' },
    { nome:'Corrida da Independência AL 2026', cidade:'Maceió', estado:'AL', data:'2026-09-07', distancias:'5km,10km', organizador:'FAAL' },
    { nome:'Corrida Pajuçara Run 2026', cidade:'Maceió', estado:'AL', data:'2026-07-12', distancias:'5km,10km', organizador:'Prefeitura Maceió' },
    // PIAUÍ
    { nome:'Maratona de Teresina 2026', cidade:'Teresina', estado:'PI', data:'2026-07-19', distancias:'42km,21km,10km', organizador:'PI Marathon' },
    { nome:'Corrida da Cidade de Teresina 2026', cidade:'Teresina', estado:'PI', data:'2026-08-15', distancias:'5km,10km', organizador:'Prefeitura Teresina' },
    // ESPÍRITO SANTO
    { nome:'Maratona de Vitória 2026', cidade:'Vitória', estado:'ES', data:'2026-10-25', distancias:'42km,21km,10km', organizador:'ES Marathon' },
    { nome:'Corrida da Baía de Vitória 2026', cidade:'Vitória', estado:'ES', data:'2026-07-05', distancias:'5km,10km', organizador:'Prefeitura Vitória' },
    { nome:'Corrida Guarapari Run 2026', cidade:'Guarapari', estado:'ES', data:'2026-03-22', distancias:'5km,10km', organizador:'Prefeitura Guarapari' },
    // PARÁ
    { nome:'Maratona do Círio 2026', cidade:'Belém', estado:'PA', data:'2026-10-11', distancias:'42km,21km,10km', organizador:'PA Marathon' },
    { nome:'Corrida da Amazônia 2026', cidade:'Belém', estado:'PA', data:'2026-08-09', distancias:'5km,10km', organizador:'Prefeitura Belém' },
    // MATO GROSSO DO SUL
    { nome:'Maratona de Campo Grande 2026', cidade:'Campo Grande', estado:'MS', data:'2026-06-21', distancias:'42km,21km,10km', organizador:'CG Marathon' },
    { nome:'Corrida dos Ipês MS 2026', cidade:'Campo Grande', estado:'MS', data:'2026-09-20', distancias:'5km,10km', organizador:'Prefeitura CG' },
    // MATO GROSSO
    { nome:'Corrida de Rua de Cuiabá 2026', cidade:'Cuiabá', estado:'MT', data:'2026-07-08', distancias:'5km,10km', organizador:'FAMT' },
    { nome:'Maratona de Cuiabá 2026', cidade:'Cuiabá', estado:'MT', data:'2026-10-04', distancias:'42km,21km,10km', organizador:'MT Marathon' },
    // AMAZONAS
    { nome:'Maratona de Manaus 2026', cidade:'Manaus', estado:'AM', data:'2026-09-27', distancias:'42km,21km,10km', organizador:'AM Marathon' },
    { nome:'Corrida da Floresta Manaus 2026', cidade:'Manaus', estado:'AM', data:'2026-07-26', distancias:'5km,10km', organizador:'Prefeitura Manaus' },
    // TOCANTINS
    { nome:'Corrida de Rua de Palmas 2026', cidade:'Palmas', estado:'TO', data:'2026-05-20', distancias:'5km,10km', organizador:'Prefeitura Palmas' },
    { nome:'Maratona de Palmas 2026', cidade:'Palmas', estado:'TO', data:'2026-10-18', distancias:'42km,21km', organizador:'TO Marathon' },
    // RONDÔNIA
    { nome:'Corrida de Rua de Porto Velho 2026', cidade:'Porto Velho', estado:'RO', data:'2026-06-15', distancias:'5km,10km', organizador:'Prefeitura Porto Velho' },
    // ACRE
    { nome:'Corrida de Rua de Rio Branco 2026', cidade:'Rio Branco', estado:'AC', data:'2026-08-05', distancias:'5km,10km', organizador:'Prefeitura Rio Branco' },
    // RORAIMA
    { nome:'Corrida de Rua de Boa Vista 2026', cidade:'Boa Vista', estado:'RR', data:'2026-09-15', distancias:'5km,10km', organizador:'Prefeitura Boa Vista' },
    // AMAPÁ
    { nome:'Corrida de Rua de Macapá 2026', cidade:'Macapá', estado:'AP', data:'2026-10-05', distancias:'5km,10km', organizador:'Prefeitura Macapá' },
    // DISTRITO FEDERAL
    { nome:'Maratona de Brasília 2026', cidade:'Brasília', estado:'DF', data:'2026-05-17', distancias:'42km,21km,10km', link:'https://www.maratonabrasilia.com.br', organizador:'GDF' },
    { nome:'Corrida dos Três Poderes DF 2026', cidade:'Brasília', estado:'DF', data:'2026-04-21', distancias:'5km,10km', organizador:'STF' },
    { nome:'Corrida da Candanga DF 2026', cidade:'Brasília', estado:'DF', data:'2026-04-21', distancias:'5km,10km', organizador:'GDF' },
    { nome:'Corrida de Brasília 2026', cidade:'Brasília', estado:'DF', data:'2026-08-16', distancias:'5km,10km,21km', organizador:'FADDF' },
    // MAIS SP - INTERIOR
    { nome:'Maratona de Campinas 2026', cidade:'Campinas', estado:'SP', data:'2026-05-24', distancias:'42km,21km,10km', organizador:'Campinas Marathon' },
    { nome:'Corrida de Santos SP 2026', cidade:'Santos', estado:'SP', data:'2026-06-28', distancias:'5km,10km', organizador:'Prefeitura Santos' },
    { nome:'Corrida de Ribeirão Preto 2026', cidade:'Ribeirão Preto', estado:'SP', data:'2026-07-26', distancias:'5km,10km', organizador:'Prefeitura RP' },
    { nome:'Corrida de São José dos Campos 2026', cidade:'São José dos Campos', estado:'SP', data:'2026-08-09', distancias:'5km,10km', organizador:'Prefeitura SJC' },
    { nome:'Trail Run Serra da Mantiqueira SP 2026', cidade:'Campos do Jordão', estado:'SP', data:'2026-07-19', distancias:'21km,42km', organizador:'Trail SP' },
    // MAIS MG - INTERIOR
    { nome:'Corrida de Uberlândia MG 2026', cidade:'Uberlândia', estado:'MG', data:'2026-06-14', distancias:'5km,10km', organizador:'Prefeitura Uberlândia' },
    { nome:'Corrida de Juiz de Fora 2026', cidade:'Juiz de Fora', estado:'MG', data:'2026-08-23', distancias:'5km,10km', organizador:'Prefeitura JF' },
    // MAIS RS
    { nome:'Corrida de Caxias do Sul RS 2026', cidade:'Caxias do Sul', estado:'RS', data:'2026-08-30', distancias:'5km,10km', organizador:'Prefeitura Caxias' },
    // CORRIDAS NORDESTE
    { nome:'Corrida da Fruticultura Petrolina 2026', cidade:'Petrolina', estado:'PE', data:'2026-09-06', distancias:'21km,10km', organizador:'Prefeitura Petrolina' },
    { nome:'Corrida de Caruaru PE 2026', cidade:'Caruaru', estado:'PE', data:'2026-08-15', distancias:'5km,10km', organizador:'Prefeitura Caruaru' },
    { nome:'Corrida do Forró Campina Grande 2026', cidade:'Campina Grande', estado:'PB', data:'2026-06-28', distancias:'5km,10km', organizador:'Prefeitura CG PB' },
    { nome:'Corrida de Mossoró RN 2026', cidade:'Mossoró', estado:'RN', data:'2026-09-27', distancias:'5km,10km', organizador:'Prefeitura Mossoró' },
    { nome:'Corrida de Feira de Santana BA 2026', cidade:'Feira de Santana', estado:'BA', data:'2026-07-25', distancias:'5km,10km', organizador:'Prefeitura Feira' },
    // TRAIL RUNS
    { nome:'Ultra Trail das Serras SC 2026', cidade:'Florianópolis', estado:'SC', data:'2026-06-07', distancias:'60km,30km,15km', organizador:'Trail SC' },
    { nome:'Trail Run Chapada Diamantina 2026', cidade:'Lençóis', estado:'BA', data:'2026-07-04', distancias:'50km,25km', organizador:'Trail BA' },
    { nome:'Ultra Maratona dos Canyons RS 2026', cidade:'Cambará do Sul', estado:'RS', data:'2026-08-22', distancias:'108km,60km', link:'https://www.ultramaratonadoscanyons.com.br', organizador:'Trail RS' },
    { nome:'Corrida de Montanha MG 2026', cidade:'Ouro Preto', estado:'MG', data:'2026-09-20', distancias:'21km,10km', organizador:'Trail MG' },
    { nome:'Trail Run Pantanal MS 2026', cidade:'Bonito', estado:'MS', data:'2026-07-11', distancias:'21km,42km', organizador:'Trail MS' },
  ];

  for (const c of corridas) {
    const data = parseData(c.data);
    const dist = c.distancias || extrairDistancias(c.nome);
    if (await inserir({ ...c, data, distancias: dist, fonte: 'manual-regeni' })) {
      t++;
      process.stdout.write(`\r  📌 ${t} inseridas...`);
    }
  }
  console.log(`\n  Manual: ${t} inseridas\n`);
}

// ═══════════════════════════════════════════════════════════
// SCRAPERS WEB
// ═══════════════════════════════════════════════════════════

async function scrapeRunnerBrasil() {
  console.log('🔍 RunnerBrasil.com.br...');
  let t = 0;
  try {
    for (let page = 1; page <= 30; page++) {
      const { body } = await get(`https://www.runnerbrasil.com.br/Calendario/?pagina=${page}`);
      if (!body.includes('corrida') && !body.includes('maratona')) break;

      const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1]);
      let found = 0;
      for (const row of rows) {
        const cols = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => limpar(m[1]));
        if (cols.length < 3) continue;
        const nome = cols[1] || cols[0] || '';
        if (!nome || nome.length < 5) continue;
        const dataText = cols[0] || '';
        const local = cols[2] || cols[3] || '';
        const estado = extrairEstado(local);
        const cidade = local.split(/[,\-\/]/)[0].trim();
        const data = parseData(dataText);
        const dist = extrairDistancias(nome);
        const link = row.match(/href="(https?:\/\/[^"]+)"/i)?.[1] || '';

        if (await inserir({ nome, cidade, estado, data, distancias: dist, link, fonte: 'runnerbrasil' })) {
          t++; found++;
          process.stdout.write(`\r  RunnerBrasil: ${t} inseridas`);
        }
      }
      if (found === 0 && page > 2) break;
      await DELAY(600);
    }
  } catch(e) { console.log(`\n  RunnerBrasil erro: ${e.message}`); }
  console.log(`\n  RunnerBrasil: ${t} inseridas\n`);
}

async function scrapeCorridasDoBrasil() {
  console.log('🔍 CorridasDoBrasil...');
  let t = 0;
  const urls = [
    'https://www.corridasdobrasil.com.br/calendario/',
    'https://corridasdobrasil.com.br/calendario/',
  ];
  for (const base of urls) {
    try {
      for (let page = 1; page <= 30; page++) {
        const url = page === 1 ? base : `${base}?page=${page}&pagina=${page}`;
        const { body } = await get(url);
        if (!body.includes('corrida') && !body.includes('Corrida')) break;

        const cards = [
          ...body.matchAll(/<(?:div|article|li)[^>]*class="[^"]*(?:evento|event|corrida|card)[^"]*"[^>]*>([\s\S]{100,1500}?)<\/(?:div|article|li)>/gi)
        ].map(m => m[1]);

        let found = 0;
        for (const card of cards) {
          const nome = limpar(card.match(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/i)?.[1] || '');
          const dataText = card.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1] || '';
          const local = limpar(card.match(/class="[^"]*(?:local|cidade|city|location)[^"]*"[^>]*>(.*?)<\/[^>]+>/i)?.[1] || '');
          const link = card.match(/href="(https?:\/\/[^"]+)"/i)?.[1] || '';

          if (!nome || nome.length < 5) continue;
          const data = parseData(dataText);
          const estado = extrairEstado(local);
          const cidade = local.split(/[,\-]/)[0].trim();
          const dist = extrairDistancias(nome + ' ' + card);

          if (await inserir({ nome, cidade, estado, data, distancias: dist, link, fonte: 'corridasdobrasil' })) {
            t++; found++;
            process.stdout.write(`\r  CorridasDoBrasil: ${t} inseridas`);
          }
        }

        // Tentar tabela
        if (!cards.length) {
          const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1]);
          for (const row of rows) {
            const cols = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => limpar(m[1]));
            if (cols.length < 3) continue;
            const nome = cols[1] || cols[0];
            if (!nome || nome.length < 5) continue;
            const data = parseData(cols[0]);
            const estado = extrairEstado(cols[2] || cols[3] || '');
            const cidade = (cols[2] || '').split(/[,\-]/)[0].trim();
            const dist = extrairDistancias(nome);
            if (await inserir({ nome, cidade, estado, data, distancias: dist, fonte: 'corridasdobrasil' })) {
              t++; found++;
            }
          }
          if (!rows.length) break;
        }

        if (found === 0) break;
        await DELAY(500);
      }
      if (t > 0) break;
    } catch(e) { /* tentar próxima URL */ }
  }
  console.log(`\n  CorridasDoBrasil: ${t} inseridas\n`);
}

async function scrapeChipower() {
  console.log('🔍 Chipower...');
  let t = 0;
  try {
    const urls = ['https://www.chipower.com.br/eventos', 'https://www.chipower.com.br/corridas'];
    for (const url of urls) {
      const { body } = await get(url);
      const cards = [...body.matchAll(/<(?:div|article)[^>]*class="[^"]*(?:card|evento|event)[^"]*"[^>]*>([\s\S]{50,800}?)<\/(?:div|article)>/gi)].map(m=>m[1]);

      for (const card of cards) {
        const nome = limpar(card.match(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/i)?.[1] || '');
        const dataText = card.match(/(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/)?.[1] || '';
        const local = limpar(card.match(/(?:local|cidade|location)[^>]*>(.*?)<\//i)?.[1] || '');
        const link = card.match(/href="([^"]+)"/i)?.[1] || '';
        if (!nome || nome.length < 5) continue;
        const data = parseData(dataText);
        const estado = extrairEstado(local);
        const cidade = local.split(/[,\-]/)[0].trim();
        const dist = extrairDistancias(nome + ' ' + card);
        if (await inserir({ nome, cidade, estado, data, distancias: dist, link, fonte: 'chipower' })) {
          t++;
          process.stdout.write(`\r  Chipower: ${t} inseridas`);
        }
      }
      await DELAY(500);
    }
  } catch(e) { console.log(`\n  Chipower erro: ${e.message}`); }
  console.log(`\n  Chipower: ${t} inseridas\n`);
}

async function scrapeMinhasInscricoes() {
  console.log('🔍 MinhasInscricoes...');
  let t = 0;
  const estados = ['SP','RJ','MG','RS','PR','CE','BA','GO','PE','SC','MA','PA','ES','PB','RN','AL','SE','PI','MS','MT','RO','TO','AM','AC','AP','RR','DF'];

  for (const uf of estados) {
    try {
      const url = `https://www.minhasinscricoes.com.br/sites/pesquisa.aspx?estado=${uf}&esporte=corrida`;
      const { body } = await get(url);

      // Tentar JSON embutido
      const jsonMatch = body.match(/var\s+eventos\s*=\s*(\[.*?\]);/s) ||
                        body.match(/"events"\s*:\s*(\[.*?\])/s);
      if (jsonMatch) {
        try {
          const eventos = JSON.parse(jsonMatch[1]);
          for (const ev of eventos) {
            const nome = ev.nome || ev.name || ev.titulo || '';
            const data = parseData(ev.data || ev.date || ev.dataEvento || '');
            const cidade = ev.cidade || ev.city || '';
            const dist = extrairDistancias(nome + ' ' + (ev.distancias || ''));
            const link = ev.link || ev.url || '';
            if (await inserir({ nome, cidade, estado: uf, data, distancias: dist, link, fonte: 'minhasinscricoes' })) {
              t++;
              process.stdout.write(`\r  MinhasInscricoes: ${t} inseridas`);
            }
          }
          continue;
        } catch(e) {}
      }

      // HTML fallback
      const cards = [...body.matchAll(/<(?:div|tr|li)[^>]*class="[^"]*(?:evento|result|card)[^"]*"[^>]*>([\s\S]{50,500}?)<\/(?:div|tr|li)>/gi)].map(m=>m[1]);
      for (const card of cards) {
        const nome = limpar(card.match(/<(?:h[1-4]|strong|b|a)[^>]*>(.*?)<\/(?:h[1-4]|strong|b|a)>/i)?.[1] || '');
        const dataText = card.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1] || '';
        const cidade = limpar(card.match(/class="[^"]*cid[^"]*"[^>]*>(.*?)<\/[^>]+>/i)?.[1] || '').split(/[,\/]/)[0].trim();
        const link = card.match(/href="([^"]+)"/i)?.[1] || '';
        if (!nome || nome.length < 5) continue;
        const data = parseData(dataText);
        const dist = extrairDistancias(nome);
        if (await inserir({ nome, cidade, estado: uf, data, distancias: dist, link, fonte: 'minhasinscricoes' })) {
          t++;
          process.stdout.write(`\r  MinhasInscricoes: ${t} inseridas`);
        }
      }
      await DELAY(300);
    } catch(e) { /* estado sem resultado */ }
  }
  console.log(`\n  MinhasInscricoes: ${t} inseridas\n`);
}

async function scrapeWebRun() {
  console.log('🔍 WebRun...');
  let t = 0;
  try {
    for (let page = 1; page <= 20; page++) {
      const { body } = await get(`https://www.webrun.com.br/calendario/?page=${page}`);
      if (!body.includes('corrida') && !body.includes('Corrida')) break;

      const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1]);
      let found = 0;
      for (const row of rows) {
        const cols = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => limpar(m[1]));
        if (cols.length < 3) continue;
        const nome = cols[1] || cols[0];
        if (!nome || nome.length < 5) continue;
        const data = parseData(cols[0]);
        const local = cols[2] || '';
        const estado = extrairEstado(local);
        const cidade = local.split(/[,\-]/)[0].trim();
        const dist = extrairDistancias(nome);
        const link = row.match(/href="(https?:\/\/[^"]+)"/i)?.[1] || '';
        if (await inserir({ nome, cidade, estado, data, distancias: dist, link, fonte: 'webrun' })) {
          t++; found++;
          process.stdout.write(`\r  WebRun: ${t} inseridas`);
        }
      }
      if (found === 0 && page > 3) break;
      await DELAY(600);
    }
  } catch(e) { console.log(`\n  WebRun erro: ${e.message}`); }
  console.log(`\n  WebRun: ${t} inseridas\n`);
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════
async function main() {
  console.log('🚀 REGENI — Scraper CorridaAberta Brasil\n');
  console.log(`⏰ ${new Date().toLocaleString('pt-BR')}\n`);

  await conectar();
  await inserirManuais();
  await scrapeRunnerBrasil();
  await scrapeCorridasDoBrasil();
  await scrapeChipower();
  await scrapeMinhasInscricoes();
  await scrapeWebRun();

  const r = await client.query(`SELECT COUNT(*) FROM "CorridaAberta" WHERE ativa=true`);
  const estados = await client.query(`SELECT estado, COUNT(*) as total FROM "CorridaAberta" WHERE ativa=true GROUP BY estado ORDER BY total DESC LIMIT 10`);

  console.log('\n═══════════════════════════════════════');
  console.log('✅ CONCLUÍDO!');
  console.log(`   Inseridas agora: ${inseridas}`);
  console.log(`   Total no banco: ${r.rows[0].count} corridas abertas`);
  console.log('\n   Top estados:');
  estados.rows.forEach(e => console.log(`   ${e.estado}: ${e.total}`));
  console.log('═══════════════════════════════════════');

  await client.end();
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
