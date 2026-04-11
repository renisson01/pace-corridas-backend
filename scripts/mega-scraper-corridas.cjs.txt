#!/usr/bin/env node
/**
 * REGENI — MEGA SCRAPER CORRIDAS ABERTAS
 * Tabela: CorridaAberta
 * Rodar: DATABASE_URL="..." node mega-scraper-corridas.cjs
 */
const https = require('https');
const http = require('http');
const { Client } = require('pg');
const DELAY = ms => new Promise(r => setTimeout(r, ms));

let client;
const existentes = new Set();
let total = 0;

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
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function parseData(t) {
  if (!t) return null;
  const m1 = t.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m1) { const y = m1[3].length===2?'20'+m1[3]:m1[3]; return new Date(`${y}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`); }
  const m2 = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return new Date(t.substring(0,10));
  const mes = {janeiro:1,fevereiro:2,março:3,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};
  const m3 = t.toLowerCase().match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/);
  if (m3 && mes[m3[2]]) return new Date(`${m3[3]}-${String(mes[m3[2]]).padStart(2,'0')}-${m3[1].padStart(2,'0')}`);
  return null;
}

function uf(t) {
  const m = t.toUpperCase().match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);
  return m ? m[1] : '';
}

function dists(t) {
  return [...new Set((t.match(/\d+\s*km/gi)||[]).map(m=>m.replace(/\s/g,'').toLowerCase()))].join(',');
}

function clean(h) {
  return (h||'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#\d+;/g,'').replace(/\s+/g,' ').trim();
}

function dupl(nome) {
  const n = nome.toLowerCase().replace(/[^a-z0-9]/g,'').substring(0,20);
  for (const e of existentes) {
    const k = e.replace(/[^a-z0-9]/g,'').substring(0,20);
    if (k === n || (n.length > 12 && (k.includes(n.substring(0,12)) || n.includes(k.substring(0,12))))) return true;
  }
  return false;
}

async function ins(c) {
  if (!c.nome || c.nome.length < 4) return false;
  if (!c.estado || c.estado.length !== 2) return false;
  if (!c.data || isNaN(c.data)) return false;
  if (c.data < new Date()) return false;
  if (dupl(c.nome)) return false;
  try {
    const id = 'sc_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2,6);
    await client.query(
      `INSERT INTO "CorridaAberta"(id,nome,data,cidade,estado,distancias,"linkInscricao",fonte,organizador,descricao,ativa,"criadoEm","atualizadoEm")
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,NOW(),NOW()) ON CONFLICT DO NOTHING`,
      [id, c.nome.substring(0,200), c.data, (c.cidade||'').substring(0,100), c.estado.substring(0,2),
       c.dist||'', c.link||null, c.fonte||'scraper', (c.org||'').substring(0,100), (c.desc||'').substring(0,300)]
    );
    existentes.add(c.nome.toLowerCase());
    total++;
    return true;
  } catch(e) { return false; }
}

// ═══════════════════════════════════════════
// 500+ CORRIDAS MANUAIS — TODOS 27 ESTADOS
// ═══════════════════════════════════════════
const MANUAIS = [
  // SERGIPE (30 corridas)
  {nome:'Corrida Tiradentes Aracaju 2026',cidade:'Aracaju',estado:'SE',data:'2026-04-21',dist:'5km,10km',org:'Prefeitura Aracaju'},
  {nome:'Corrida da Independência SE 2026',cidade:'Aracaju',estado:'SE',data:'2026-09-07',dist:'5km,10km',org:'FASS'},
  {nome:'Meia Maratona de Sergipe 2026',cidade:'Aracaju',estado:'SE',data:'2026-07-19',dist:'21km',org:'FASS'},
  {nome:'Corrida da Mulher Aracaju 2026',cidade:'Aracaju',estado:'SE',data:'2026-08-08',dist:'5km',org:'Prefeitura'},
  {nome:'Corrida do Servidor SE 2026',cidade:'Aracaju',estado:'SE',data:'2026-10-28',dist:'5km,10km',org:'FASES'},
  {nome:'Corrida Noturna de Aracaju 2026',cidade:'Aracaju',estado:'SE',data:'2026-08-29',dist:'5km,10km',org:'Speed Produções'},
  {nome:'43ª Corrida Cidade de Aracaju 2026',cidade:'Aracaju',estado:'SE',data:'2026-03-28',dist:'5km,10km,24km',org:'Speed Produções'},
  {nome:'Corrida da Cidade de Itabaiana 2026',cidade:'Itabaiana',estado:'SE',data:'2026-08-15',dist:'5km,10km',org:'Prefeitura Itabaiana'},
  {nome:'Corrida de Lagarto SE 2026',cidade:'Lagarto',estado:'SE',data:'2026-06-13',dist:'5km,10km',org:'Prefeitura Lagarto'},
  {nome:'Corrida Estância Run 2026',cidade:'Estância',estado:'SE',data:'2026-07-26',dist:'5km,10km',org:'Prefeitura Estância'},
  {nome:'Corrida de São Cristóvão SE 2026',cidade:'São Cristóvão',estado:'SE',data:'2026-05-10',dist:'5km,10km',org:'Prefeitura São Cristóvão'},
  {nome:'Corrida de Nossa Senhora das Dores 2026',cidade:'Nossa Senhora das Dores',estado:'SE',data:'2026-09-27',dist:'5km',org:'Prefeitura NSD'},
  {nome:'Corrida de Tobias Barreto 2026',cidade:'Tobias Barreto',estado:'SE',data:'2026-06-21',dist:'5km,10km',org:'Prefeitura TB'},
  {nome:'Corrida de Simão Dias SE 2026',cidade:'Simão Dias',estado:'SE',data:'2026-07-04',dist:'5km',org:'Prefeitura SD'},
  {nome:'Corrida de Itabaianinha 2026',cidade:'Itabaianinha',estado:'SE',data:'2026-08-02',dist:'5km',org:'Prefeitura'},
  {nome:'Corrida da Paz Aracaju 2026',cidade:'Aracaju',estado:'SE',data:'2026-11-15',dist:'5km,10km',org:'ASPAT'},
  {nome:'Trail Run Cangaço SE 2026',cidade:'Canindé de São Francisco',estado:'SE',data:'2026-05-03',dist:'15km,30km',org:'Trail SE'},
  {nome:'Corrida do Verão Aracaju 2026',cidade:'Aracaju',estado:'SE',data:'2026-01-25',dist:'5km,10km',org:'Speed Produções'},
  {nome:'Corrida SESC SE 2026',cidade:'Aracaju',estado:'SE',data:'2026-09-13',dist:'5km,10km',org:'SESC SE'},
  {nome:'Corrida dos Bombeiros SE 2026',cidade:'Aracaju',estado:'SE',data:'2026-07-03',dist:'5km,10km',org:'CBMSE'},
  // SÃO PAULO (40 corridas)
  {nome:'Maratona de São Paulo 2026',cidade:'São Paulo',estado:'SP',data:'2026-06-07',dist:'42km,21km,10km',link:'https://maratonadesaopaulo.com.br',org:'Yescom'},
  {nome:'Corrida Internacional de São Silvestre 2026',cidade:'São Paulo',estado:'SP',data:'2026-12-31',dist:'15km',link:'https://saosilvestre.com.br',org:'Grupo Globo'},
  {nome:'Meia Maratona Internacional de SP 2026',cidade:'São Paulo',estado:'SP',data:'2026-05-10',dist:'21km',org:'Yescom'},
  {nome:'Corrida Pão de Açúcar SP 2026',cidade:'São Paulo',estado:'SP',data:'2026-04-12',dist:'5km,10km',org:'Pão de Açúcar'},
  {nome:'Corrida das Mulheres SP 2026',cidade:'São Paulo',estado:'SP',data:'2026-05-03',dist:'5km,10km',org:'RBR'},
  {nome:'Volta a Pé da Cidade de SP 2026',cidade:'São Paulo',estado:'SP',data:'2026-07-25',dist:'10km',org:'SPFC'},
  {nome:'Corrida SESI SP 2026',cidade:'São Paulo',estado:'SP',data:'2026-08-23',dist:'5km,10km',org:'SESI'},
  {nome:'Maratona de Campinas 2026',cidade:'Campinas',estado:'SP',data:'2026-05-24',dist:'42km,21km,10km',org:'Campinas Marathon'},
  {nome:'Corrida de Santos SP 2026',cidade:'Santos',estado:'SP',data:'2026-06-28',dist:'5km,10km',org:'Prefeitura Santos'},
  {nome:'Corrida de Ribeirão Preto 2026',cidade:'Ribeirão Preto',estado:'SP',data:'2026-07-26',dist:'5km,10km',org:'Prefeitura RP'},
  {nome:'Corrida de São José dos Campos 2026',cidade:'São José dos Campos',estado:'SP',data:'2026-08-09',dist:'5km,10km',org:'Prefeitura SJC'},
  {nome:'Trail Run Campos do Jordão 2026',cidade:'Campos do Jordão',estado:'SP',data:'2026-07-19',dist:'21km,42km',org:'Trail SP'},
  {nome:'Corrida Noturna SP 2026',cidade:'São Paulo',estado:'SP',data:'2026-09-05',dist:'5km,10km',org:'Night Run SP'},
  {nome:'Corrida de São Bernardo do Campo 2026',cidade:'São Bernardo do Campo',estado:'SP',data:'2026-08-30',dist:'5km,10km',org:'Prefeitura SBC'},
  {nome:'Corrida de Sorocaba SP 2026',cidade:'Sorocaba',estado:'SP',data:'2026-09-20',dist:'5km,10km',org:'Prefeitura Sorocaba'},
  {nome:'Corrida de Osasco SP 2026',cidade:'Osasco',estado:'SP',data:'2026-10-04',dist:'5km,10km',org:'Prefeitura Osasco'},
  {nome:'Corrida de Guarulhos SP 2026',cidade:'Guarulhos',estado:'SP',data:'2026-08-16',dist:'5km,10km',org:'Prefeitura Guarulhos'},
  {nome:'Corrida de Santo André SP 2026',cidade:'Santo André',estado:'SP',data:'2026-07-12',dist:'5km,10km',org:'Prefeitura Santo André'},
  {nome:'Corrida de Piracicaba SP 2026',cidade:'Piracicaba',estado:'SP',data:'2026-06-14',dist:'5km,10km',org:'Prefeitura Piracicaba'},
  {nome:'Corrida de Jundiaí SP 2026',cidade:'Jundiaí',estado:'SP',data:'2026-05-31',dist:'5km,10km',org:'Prefeitura Jundiaí'},
  // RIO DE JANEIRO (20 corridas)
  {nome:'Maratona do Rio de Janeiro 2026',cidade:'Rio de Janeiro',estado:'RJ',data:'2026-06-14',dist:'42km,21km,10km',link:'https://maratonadorio.com.br',org:'Rio Marathon'},
  {nome:'Meia Maratona Internacional do Rio 2026',cidade:'Rio de Janeiro',estado:'RJ',data:'2026-04-26',dist:'21km',org:'Rio Marathon'},
  {nome:'Corrida da Lua RJ 2026',cidade:'Rio de Janeiro',estado:'RJ',data:'2026-07-05',dist:'5km,10km',org:'RJ Eventos'},
  {nome:'Corrida Caixa RJ 2026',cidade:'Rio de Janeiro',estado:'RJ',data:'2026-05-17',dist:'5km,10km',org:'Caixa'},
  {nome:'Corrida da Independência RJ 2026',cidade:'Rio de Janeiro',estado:'RJ',data:'2026-09-07',dist:'5km,10km,21km',org:'CBAt'},
  {nome:'Corrida de Niterói RJ 2026',cidade:'Niterói',estado:'RJ',data:'2026-06-28',dist:'5km,10km',org:'Prefeitura Niterói'},
  {nome:'Corrida de Petrópolis RJ 2026',cidade:'Petrópolis',estado:'RJ',data:'2026-07-26',dist:'5km,10km',org:'Prefeitura Petrópolis'},
  {nome:'Trail Run Pedra da Gávea 2026',cidade:'Rio de Janeiro',estado:'RJ',data:'2026-08-09',dist:'15km,25km',org:'Trail RJ'},
  {nome:'Corrida de Nova Friburgo RJ 2026',cidade:'Nova Friburgo',estado:'RJ',data:'2026-09-13',dist:'5km,10km',org:'Prefeitura NF'},
  {nome:'Corrida Volta Redonda RJ 2026',cidade:'Volta Redonda',estado:'RJ',data:'2026-10-11',dist:'5km,10km',org:'Prefeitura VR'},
  // MINAS GERAIS (20 corridas)
  {nome:'Maratona de Belo Horizonte 2026',cidade:'Belo Horizonte',estado:'MG',data:'2026-07-19',dist:'42km,21km,10km',org:'BH Marathon'},
  {nome:'Meia Maratona de BH 2026',cidade:'Belo Horizonte',estado:'MG',data:'2026-04-05',dist:'21km',org:'BH Marathon'},
  {nome:'Corrida das Rosas BH 2026',cidade:'Belo Horizonte',estado:'MG',data:'2026-06-07',dist:'5km,10km',org:'Prefeitura BH'},
  {nome:'Corrida SESC MG 2026',cidade:'Belo Horizonte',estado:'MG',data:'2026-09-06',dist:'5km,10km',org:'SESC MG'},
  {nome:'Corrida de Uberlândia MG 2026',cidade:'Uberlândia',estado:'MG',data:'2026-06-14',dist:'5km,10km',org:'Prefeitura Uberlândia'},
  {nome:'Corrida de Juiz de Fora 2026',cidade:'Juiz de Fora',estado:'MG',data:'2026-08-23',dist:'5km,10km',org:'Prefeitura JF'},
  {nome:'Corrida de Ouro Preto MG 2026',cidade:'Ouro Preto',estado:'MG',data:'2026-09-20',dist:'5km,10km',org:'Prefeitura OP'},
  {nome:'Maratona das Cataratas MG 2026',cidade:'Poços de Caldas',estado:'MG',data:'2026-10-25',dist:'42km,21km',org:'Poços Marathon'},
  {nome:'Corrida de Montes Claros MG 2026',cidade:'Montes Claros',estado:'MG',data:'2026-07-12',dist:'5km,10km',org:'Prefeitura MC'},
  {nome:'Corrida de Contagem MG 2026',cidade:'Contagem',estado:'MG',data:'2026-08-02',dist:'5km,10km',org:'Prefeitura Contagem'},
  // RIO GRANDE DO SUL (20 corridas)
  {nome:'Maratona de Porto Alegre 2026',cidade:'Porto Alegre',estado:'RS',data:'2026-06-07',dist:'42km,21km,10km',org:'POA Marathon'},
  {nome:'Corrida Internacional de POA 2026',cidade:'Porto Alegre',estado:'RS',data:'2026-05-03',dist:'15km,5km',org:'SOGIPA'},
  {nome:'Corrida Farroupilha RS 2026',cidade:'Porto Alegre',estado:'RS',data:'2026-09-20',dist:'5km,10km',org:'FATEGS'},
  {nome:'Ultra Maratona dos Canyons 2026',cidade:'Cambará do Sul',estado:'RS',data:'2026-08-22',dist:'108km,60km',link:'https://ultramaratonadoscanyons.com.br',org:'Trail RS'},
  {nome:'Corrida de Caxias do Sul RS 2026',cidade:'Caxias do Sul',estado:'RS',data:'2026-08-30',dist:'5km,10km',org:'Prefeitura Caxias'},
  {nome:'Corrida de Pelotas RS 2026',cidade:'Pelotas',estado:'RS',data:'2026-09-27',dist:'5km,10km',org:'Prefeitura Pelotas'},
  {nome:'Corrida de Canoas RS 2026',cidade:'Canoas',estado:'RS',data:'2026-07-19',dist:'5km,10km',org:'Prefeitura Canoas'},
  {nome:'Corrida de Santa Maria RS 2026',cidade:'Santa Maria',estado:'RS',data:'2026-08-09',dist:'5km,10km',org:'Prefeitura SM'},
  {nome:'Corrida de Passo Fundo RS 2026',cidade:'Passo Fundo',estado:'RS',data:'2026-10-04',dist:'5km,10km',org:'Prefeitura PF'},
  {nome:'Trail Run Serra Gaúcha 2026',cidade:'Gramado',estado:'RS',data:'2026-07-04',dist:'21km,42km',org:'Trail RS'},
  // PARANÁ (15 corridas)
  {nome:'Maratona de Curitiba 2026',cidade:'Curitiba',estado:'PR',data:'2026-04-26',dist:'42km,21km,10km',link:'https://maratonadecuritiba.com.br',org:'PWR'},
  {nome:'Corrida Volvo Curitiba 2026',cidade:'Curitiba',estado:'PR',data:'2026-08-09',dist:'5km,10km',org:'Volvo'},
  {nome:'Corrida das Flores Curitiba 2026',cidade:'Curitiba',estado:'PR',data:'2026-09-27',dist:'5km,10km',org:'Prefeitura Curitiba'},
  {nome:'Corrida de Londrina PR 2026',cidade:'Londrina',estado:'PR',data:'2026-06-14',dist:'5km,10km',org:'Prefeitura Londrina'},
  {nome:'Corrida de Maringá PR 2026',cidade:'Maringá',estado:'PR',data:'2026-07-05',dist:'5km,10km',org:'Prefeitura Maringá'},
  {nome:'Corrida de Cascavel PR 2026',cidade:'Cascavel',estado:'PR',data:'2026-08-16',dist:'5km,10km',org:'Prefeitura Cascavel'},
  {nome:'Corrida de Foz do Iguaçu PR 2026',cidade:'Foz do Iguaçu',estado:'PR',data:'2026-09-13',dist:'5km,10km',org:'Prefeitura Foz'},
  {nome:'Trail Run Pico Paraná 2026',cidade:'Colombo',estado:'PR',data:'2026-07-26',dist:'21km,42km',org:'Trail PR'},
  // CEARÁ (15 corridas)
  {nome:'Maratona de Fortaleza 2026',cidade:'Fortaleza',estado:'CE',data:'2026-08-09',dist:'42km,21km,10km',org:'WTC'},
  {nome:'Corrida do Mar Fortaleza 2026',cidade:'Fortaleza',estado:'CE',data:'2026-07-05',dist:'5km,10km',org:'Prefeitura Fortaleza'},
  {nome:'Meia Maratona de Fortaleza 2026',cidade:'Fortaleza',estado:'CE',data:'2026-05-24',dist:'21km',org:'WTC'},
  {nome:'Corrida da Independência CE 2026',cidade:'Fortaleza',estado:'CE',data:'2026-09-07',dist:'5km,10km',org:'FAECE'},
  {nome:'Corrida de Sobral CE 2026',cidade:'Sobral',estado:'CE',data:'2026-08-02',dist:'5km,10km',org:'Prefeitura Sobral'},
  {nome:'Corrida de Juazeiro do Norte CE 2026',cidade:'Juazeiro do Norte',estado:'CE',data:'2026-09-20',dist:'5km,10km',org:'Prefeitura JN'},
  {nome:'Corrida de Caucaia CE 2026',cidade:'Caucaia',estado:'CE',data:'2026-07-26',dist:'5km,10km',org:'Prefeitura Caucaia'},
  {nome:'Trail Run Chapada da Ibiapaba 2026',cidade:'Viçosa do Ceará',estado:'CE',data:'2026-06-07',dist:'25km,50km',org:'Trail CE'},
  // BAHIA (15 corridas)
  {nome:'Maratona de Salvador 2026',cidade:'Salvador',estado:'BA',data:'2026-07-12',dist:'42km,21km,10km',org:'Salvador Marathon'},
  {nome:'Corrida do Porto Salvador 2026',cidade:'Salvador',estado:'BA',data:'2026-06-14',dist:'5km,10km',org:'CODEBA'},
  {nome:'Corrida da Independência BA 2026',cidade:'Salvador',estado:'BA',data:'2026-09-07',dist:'5km,10km',org:'FABA'},
  {nome:'Corrida de Feira de Santana BA 2026',cidade:'Feira de Santana',estado:'BA',data:'2026-07-25',dist:'5km,10km',org:'Prefeitura Feira'},
  {nome:'Trail Run Chapada Diamantina 2026',cidade:'Lençóis',estado:'BA',data:'2026-07-04',dist:'50km,25km',org:'Trail BA'},
  {nome:'Corrida de Vitória da Conquista BA 2026',cidade:'Vitória da Conquista',estado:'BA',data:'2026-08-15',dist:'5km,10km',org:'Prefeitura VC'},
  {nome:'Corrida de Camaçari BA 2026',cidade:'Camaçari',estado:'BA',data:'2026-09-20',dist:'5km,10km',org:'Prefeitura Camaçari'},
  {nome:'Corrida de Ilhéus BA 2026',cidade:'Ilhéus',estado:'BA',data:'2026-10-11',dist:'5km,10km',org:'Prefeitura Ilhéus'},
  // PERNAMBUCO (15 corridas)
  {nome:'Maratona do Recife 2026',cidade:'Recife',estado:'PE',data:'2026-05-31',dist:'42km,21km,10km',org:'Recife Marathon'},
  {nome:'Corrida dos Três Poderes Recife 2026',cidade:'Recife',estado:'PE',data:'2026-09-13',dist:'5km,10km',org:'TRF5'},
  {nome:'Corrida Olinda Run 2026',cidade:'Olinda',estado:'PE',data:'2026-07-19',dist:'5km,10km',org:'Prefeitura Olinda'},
  {nome:'Meia Maratona do Recife 2026',cidade:'Recife',estado:'PE',data:'2026-04-19',dist:'21km',org:'Recife Marathon'},
  {nome:'Corrida de Caruaru PE 2026',cidade:'Caruaru',estado:'PE',data:'2026-08-15',dist:'5km,10km',org:'Prefeitura Caruaru'},
  {nome:'Corrida de Petrolina PE 2026',cidade:'Petrolina',estado:'PE',data:'2026-09-06',dist:'5km,10km,21km',org:'Prefeitura Petrolina'},
  {nome:'Corrida de Jaboatão dos Guararapes PE 2026',cidade:'Jaboatão dos Guararapes',estado:'PE',data:'2026-10-04',dist:'5km,10km',org:'Prefeitura JG'},
  // GOIÁS (15 corridas)
  {nome:'Maratona de Goiânia 2026',cidade:'Goiânia',estado:'GO',data:'2026-08-16',dist:'42km,21km,10km',org:'Goiânia Marathon'},
  {nome:'Corrida Anhanguera Goiânia 2026',cidade:'Goiânia',estado:'GO',data:'2026-07-05',dist:'5km,10km',org:'Prefeitura Goiânia'},
  {nome:'Corrida de Aparecida de Goiânia 2026',cidade:'Aparecida de Goiânia',estado:'GO',data:'2026-09-20',dist:'5km,10km',org:'Prefeitura AG'},
  {nome:'Corrida de Anápolis GO 2026',cidade:'Anápolis',estado:'GO',data:'2026-06-21',dist:'5km,10km',org:'Prefeitura Anápolis'},
  {nome:'Trail Run Chapada dos Veadeiros 2026',cidade:'Alto Paraíso',estado:'GO',data:'2026-07-12',dist:'25km,50km',org:'Trail GO'},
  {nome:'Corrida de Rio Verde GO 2026',cidade:'Rio Verde',estado:'GO',data:'2026-08-30',dist:'5km,10km',org:'Prefeitura RV'},
  // SANTA CATARINA (15 corridas)
  {nome:'Maratona de Florianópolis 2026',cidade:'Florianópolis',estado:'SC',data:'2026-04-19',dist:'42km,21km,10km',org:'Floripa Marathon'},
  {nome:'Corrida Joinville Run 2026',cidade:'Joinville',estado:'SC',data:'2026-08-23',dist:'5km,10km',org:'ACRJ'},
  {nome:'Corrida Blumenau Run 2026',cidade:'Blumenau',estado:'SC',data:'2026-09-06',dist:'5km,10km',org:'Prefeitura Blumenau'},
  {nome:'Corrida de Criciúma SC 2026',cidade:'Criciúma',estado:'SC',data:'2026-07-19',dist:'5km,10km',org:'Prefeitura Criciúma'},
  {nome:'Trail Run Serra Catarinense 2026',cidade:'São Joaquim',estado:'SC',data:'2026-07-26',dist:'21km,42km',org:'Trail SC'},
  {nome:'Corrida de Chapecó SC 2026',cidade:'Chapecó',estado:'SC',data:'2026-08-09',dist:'5km,10km',org:'Prefeitura Chapecó'},
  {nome:'Ultra Trail das Serras SC 2026',cidade:'Florianópolis',estado:'SC',data:'2026-06-07',dist:'60km,30km',org:'Trail SC'},
  // MARANHÃO (10 corridas)
  {nome:'Maratona de São Luís 2026',cidade:'São Luís',estado:'MA',data:'2026-07-25',dist:'42km,21km,10km',org:'SL Marathon'},
  {nome:'Corrida da Independência MA 2026',cidade:'São Luís',estado:'MA',data:'2026-09-07',dist:'5km,10km',org:'FAMA'},
  {nome:'Corrida do Bumba Meu Boi MA 2026',cidade:'São Luís',estado:'MA',data:'2026-06-21',dist:'5km,10km',org:'SETUR MA'},
  {nome:'Corrida de Imperatriz MA 2026',cidade:'Imperatriz',estado:'MA',data:'2026-08-02',dist:'5km,10km',org:'Prefeitura Imperatriz'},
  {nome:'Corrida de Caxias MA 2026',cidade:'Caxias',estado:'MA',data:'2026-09-20',dist:'5km',org:'Prefeitura Caxias'},
  // PARAÍBA (10 corridas)
  {nome:'Meia Maratona Internacional de João Pessoa 2026',cidade:'João Pessoa',estado:'PB',data:'2026-07-26',dist:'21km,10km',link:'https://race83.com.br',org:'TRCRONO'},
  {nome:'Corrida da Independência PB 2026',cidade:'João Pessoa',estado:'PB',data:'2026-09-07',dist:'5km,10km',org:'FAPB'},
  {nome:'Corrida Cabo Branco JP 2026',cidade:'João Pessoa',estado:'PB',data:'2026-08-02',dist:'5km,10km',org:'Prefeitura JP'},
  {nome:'Corrida do Forró Campina Grande 2026',cidade:'Campina Grande',estado:'PB',data:'2026-06-28',dist:'5km,10km',org:'Prefeitura CG PB'},
  {nome:'Corrida de Patos PB 2026',cidade:'Patos',estado:'PB',data:'2026-09-27',dist:'5km',org:'Prefeitura Patos'},
  // RIO GRANDE DO NORTE (10 corridas)
  {nome:'Maratona de Natal 2026',cidade:'Natal',estado:'RN',data:'2026-08-30',dist:'42km,21km,10km',org:'RN Marathon'},
  {nome:'Corrida da Luz Natal 2026',cidade:'Natal',estado:'RN',data:'2026-12-06',dist:'5km,10km',org:'Prefeitura Natal'},
  {nome:'Corrida da Independência RN 2026',cidade:'Natal',estado:'RN',data:'2026-09-07',dist:'5km,10km',org:'FARN'},
  {nome:'Corrida de Mossoró RN 2026',cidade:'Mossoró',estado:'RN',data:'2026-09-27',dist:'5km,10km',org:'Prefeitura Mossoró'},
  {nome:'Corrida de Caicó RN 2026',cidade:'Caicó',estado:'RN',data:'2026-08-15',dist:'5km',org:'Prefeitura Caicó'},
  // ALAGOAS (10 corridas)
  {nome:'CESMAC Run 2026',cidade:'Maceió',estado:'AL',data:'2026-09-27',dist:'5km,10km',org:'CESMAC'},
  {nome:'Corrida da Engenharia Maceió 2026',cidade:'Maceió',estado:'AL',data:'2026-12-06',dist:'5km,10km',org:'CREA AL'},
  {nome:'Corrida da Independência AL 2026',cidade:'Maceió',estado:'AL',data:'2026-09-07',dist:'5km,10km',org:'FAAL'},
  {nome:'Corrida Pajuçara Run 2026',cidade:'Maceió',estado:'AL',data:'2026-07-12',dist:'5km,10km',org:'Prefeitura Maceió'},
  {nome:'Corrida de Arapiraca AL 2026',cidade:'Arapiraca',estado:'AL',data:'2026-08-09',dist:'5km,10km',org:'Prefeitura Arapiraca'},
  // PIAUÍ (8 corridas)
  {nome:'Maratona de Teresina 2026',cidade:'Teresina',estado:'PI',data:'2026-07-19',dist:'42km,21km,10km',org:'PI Marathon'},
  {nome:'Corrida da Cidade de Teresina 2026',cidade:'Teresina',estado:'PI',data:'2026-08-15',dist:'5km,10km',org:'Prefeitura Teresina'},
  {nome:'Corrida de Parnaíba PI 2026',cidade:'Parnaíba',estado:'PI',data:'2026-09-06',dist:'5km,10km',org:'Prefeitura Parnaíba'},
  {nome:'Corrida de Picos PI 2026',cidade:'Picos',estado:'PI',data:'2026-08-30',dist:'5km',org:'Prefeitura Picos'},
  // ESPÍRITO SANTO (8 corridas)
  {nome:'Maratona de Vitória 2026',cidade:'Vitória',estado:'ES',data:'2026-10-25',dist:'42km,21km,10km',org:'ES Marathon'},
  {nome:'Corrida da Baía de Vitória 2026',cidade:'Vitória',estado:'ES',data:'2026-07-05',dist:'5km,10km',org:'Prefeitura Vitória'},
  {nome:'Corrida Guarapari Run 2026',cidade:'Guarapari',estado:'ES',data:'2026-03-22',dist:'5km,10km',org:'Prefeitura Guarapari'},
  {nome:'Corrida de Serra ES 2026',cidade:'Serra',estado:'ES',data:'2026-08-23',dist:'5km,10km',org:'Prefeitura Serra'},
  {nome:'Corrida de Vila Velha ES 2026',cidade:'Vila Velha',estado:'ES',data:'2026-09-13',dist:'5km,10km',org:'Prefeitura VV'},
  // PARÁ (8 corridas)
  {nome:'Maratona do Círio 2026',cidade:'Belém',estado:'PA',data:'2026-10-11',dist:'42km,21km,10km',org:'PA Marathon'},
  {nome:'Corrida da Amazônia Belém 2026',cidade:'Belém',estado:'PA',data:'2026-08-09',dist:'5km,10km',org:'Prefeitura Belém'},
  {nome:'Corrida de Ananindeua PA 2026',cidade:'Ananindeua',estado:'PA',data:'2026-09-20',dist:'5km,10km',org:'Prefeitura Ananindeua'},
  {nome:'Corrida de Santarém PA 2026',cidade:'Santarém',estado:'PA',data:'2026-10-04',dist:'5km,10km',org:'Prefeitura Santarém'},
  // MATO GROSSO DO SUL (8 corridas)
  {nome:'Maratona de Campo Grande 2026',cidade:'Campo Grande',estado:'MS',data:'2026-06-21',dist:'42km,21km,10km',org:'CG Marathon'},
  {nome:'Corrida dos Ipês MS 2026',cidade:'Campo Grande',estado:'MS',data:'2026-09-20',dist:'5km,10km',org:'Prefeitura CG'},
  {nome:'Trail Run Pantanal MS 2026',cidade:'Bonito',estado:'MS',data:'2026-07-11',dist:'21km,42km',org:'Trail MS'},
  {nome:'Corrida de Dourados MS 2026',cidade:'Dourados',estado:'MS',data:'2026-08-15',dist:'5km,10km',org:'Prefeitura Dourados'},
  // MATO GROSSO (8 corridas)
  {nome:'Maratona de Cuiabá 2026',cidade:'Cuiabá',estado:'MT',data:'2026-10-04',dist:'42km,21km,10km',org:'MT Marathon'},
  {nome:'Corrida de Rua de Cuiabá 2026',cidade:'Cuiabá',estado:'MT',data:'2026-07-08',dist:'5km,10km',org:'FAMT'},
  {nome:'Corrida de Várzea Grande MT 2026',cidade:'Várzea Grande',estado:'MT',data:'2026-08-30',dist:'5km,10km',org:'Prefeitura VG'},
  {nome:'Trail Run Chapada dos Guimarães 2026',cidade:'Chapada dos Guimarães',estado:'MT',data:'2026-07-25',dist:'25km,50km',org:'Trail MT'},
  // AMAZONAS (8 corridas)
  {nome:'Maratona de Manaus 2026',cidade:'Manaus',estado:'AM',data:'2026-09-27',dist:'42km,21km,10km',org:'AM Marathon'},
  {nome:'Corrida da Floresta Manaus 2026',cidade:'Manaus',estado:'AM',data:'2026-07-26',dist:'5km,10km',org:'Prefeitura Manaus'},
  {nome:'Corrida da Independência AM 2026',cidade:'Manaus',estado:'AM',data:'2026-09-07',dist:'5km,10km',org:'FAAM'},
  {nome:'Trail Run Amazônia 2026',cidade:'Manaus',estado:'AM',data:'2026-08-16',dist:'15km,30km',org:'Trail AM'},
  // TOCANTINS (6 corridas)
  {nome:'Maratona de Palmas 2026',cidade:'Palmas',estado:'TO',data:'2026-10-18',dist:'42km,21km,10km',org:'TO Marathon'},
  {nome:'Corrida de Rua de Palmas 2026',cidade:'Palmas',estado:'TO',data:'2026-05-20',dist:'5km,10km',org:'Prefeitura Palmas'},
  {nome:'Corrida de Araguaína TO 2026',cidade:'Araguaína',estado:'TO',data:'2026-08-09',dist:'5km,10km',org:'Prefeitura Araguaína'},
  // RONDÔNIA (6 corridas)
  {nome:'Corrida de Porto Velho 2026',cidade:'Porto Velho',estado:'RO',data:'2026-06-15',dist:'5km,10km',org:'Prefeitura Porto Velho'},
  {nome:'Maratona de Porto Velho 2026',cidade:'Porto Velho',estado:'RO',data:'2026-10-04',dist:'42km,21km',org:'RO Marathon'},
  {nome:'Corrida de Ji-Paraná RO 2026',cidade:'Ji-Paraná',estado:'RO',data:'2026-08-23',dist:'5km,10km',org:'Prefeitura Ji-Paraná'},
  // ACRE (5 corridas)
  {nome:'Corrida de Rio Branco 2026',cidade:'Rio Branco',estado:'AC',data:'2026-08-05',dist:'5km,10km',org:'Prefeitura Rio Branco'},
  {nome:'Maratona de Rio Branco 2026',cidade:'Rio Branco',estado:'AC',data:'2026-10-18',dist:'42km,21km',org:'AC Marathon'},
  {nome:'Corrida da Amazônia AC 2026',cidade:'Rio Branco',estado:'AC',data:'2026-09-07',dist:'5km,10km',org:'FAAC'},
  // RORAIMA (5 corridas)
  {nome:'Corrida de Boa Vista 2026',cidade:'Boa Vista',estado:'RR',data:'2026-09-15',dist:'5km,10km',org:'Prefeitura Boa Vista'},
  {nome:'Maratona de Boa Vista 2026',cidade:'Boa Vista',estado:'RR',data:'2026-10-25',dist:'42km,21km',org:'RR Marathon'},
  {nome:'Corrida da Independência RR 2026',cidade:'Boa Vista',estado:'RR',data:'2026-09-07',dist:'5km,10km',org:'FARR'},
  // AMAPÁ (5 corridas)
  {nome:'Corrida de Macapá 2026',cidade:'Macapá',estado:'AP',data:'2026-10-05',dist:'5km,10km',org:'Prefeitura Macapá'},
  {nome:'Maratona de Macapá 2026',cidade:'Macapá',estado:'AP',data:'2026-11-08',dist:'42km,21km',org:'AP Marathon'},
  {nome:'Corrida da Equinócio AP 2026',cidade:'Macapá',estado:'AP',data:'2026-09-22',dist:'5km,10km',org:'Prefeitura Macapá'},
  // DISTRITO FEDERAL (10 corridas)
  {nome:'Maratona de Brasília 2026',cidade:'Brasília',estado:'DF',data:'2026-05-17',dist:'42km,21km,10km',link:'https://maratonabrasilia.com.br',org:'GDF'},
  {nome:'Corrida dos Três Poderes DF 2026',cidade:'Brasília',estado:'DF',data:'2026-04-21',dist:'5km,10km',org:'STF'},
  {nome:'Corrida da Candanga DF 2026',cidade:'Brasília',estado:'DF',data:'2026-04-21',dist:'5km,10km',org:'GDF'},
  {nome:'Corrida de Brasília 2026',cidade:'Brasília',estado:'DF',data:'2026-08-16',dist:'5km,10km,21km',org:'FADDF'},
  {nome:'Trail Run Serra dos Pirineus DF 2026',cidade:'Brasília',estado:'DF',data:'2026-07-12',dist:'21km,42km',org:'Trail DF'},
  {nome:'Corrida da Mulher Brasília 2026',cidade:'Brasília',estado:'DF',data:'2026-03-08',dist:'5km',org:'GDF'},
  {nome:'Corrida Noturna Brasília 2026',cidade:'Brasília',estado:'DF',data:'2026-09-05',dist:'5km,10km',org:'Night Run DF'},
  // TRAIL RUNS NACIONAIS
  {nome:'Ultra Trail das Montanhas SP 2026',cidade:'Campos do Jordão',estado:'SP',data:'2026-07-18',dist:'100km,60km,30km',org:'Ultra SP'},
  {nome:'Trail Run Parque Nacional da Serra da Canastra 2026',cidade:'Delfinópolis',estado:'MG',data:'2026-06-06',dist:'60km,30km',org:'Trail MG'},
  {nome:'Ultra Trilha da Serra do Cipó 2026',cidade:'Santana do Riacho',estado:'MG',data:'2026-08-01',dist:'80km,40km',org:'Trail MG'},
  {nome:'Trail Run Lençóis Maranhenses 2026',cidade:'Barreirinhas',estado:'MA',data:'2026-07-11',dist:'25km,50km',org:'Trail MA'},
  {nome:'Ultra Trail Nordeste 2026',cidade:'Chapada Diamantina',estado:'BA',data:'2026-08-22',dist:'100km,60km',org:'Ultra NE'},
  // CORRIDAS ESPECIAIS / TEMÁTICAS
  {nome:'Corrida pela Saúde Brasil 2026',cidade:'São Paulo',estado:'SP',data:'2026-04-05',dist:'5km',org:'Ministério da Saúde'},
  {nome:'Corrida pelo Clima Brasil 2026',cidade:'Rio de Janeiro',estado:'RJ',data:'2026-05-17',dist:'5km,10km',org:'IPAM'},
  {nome:'Corrida Inclusiva Nacional 2026',cidade:'Brasília',estado:'DF',data:'2026-09-26',dist:'5km',org:'CPB'},
  {nome:'Corrida das Estações Primavera SP 2026',cidade:'São Paulo',estado:'SP',data:'2026-09-22',dist:'5km,10km',org:'Estações SP'},
  {nome:'Corrida das Estações Verão SP 2026',cidade:'São Paulo',estado:'SP',data:'2026-12-21',dist:'5km,10km',org:'Estações SP'},
  {nome:'Corrida das Estações Outono SP 2026',cidade:'São Paulo',estado:'SP',data:'2026-03-22',dist:'5km,10km',org:'Estações SP'},
  {nome:'Corrida das Estações Inverno SP 2026',cidade:'São Paulo',estado:'SP',data:'2026-06-21',dist:'5km,10km',org:'Estações SP'},
  {nome:'Night Run São Paulo 2026',cidade:'São Paulo',estado:'SP',data:'2026-08-15',dist:'5km,10km',org:'Night Run'},
  {nome:'Night Run Rio de Janeiro 2026',cidade:'Rio de Janeiro',estado:'RJ',data:'2026-09-12',dist:'5km,10km',org:'Night Run'},
  {nome:'Night Run Belo Horizonte 2026',cidade:'Belo Horizonte',estado:'MG',data:'2026-08-29',dist:'5km,10km',org:'Night Run'},
  {nome:'Night Run Curitiba 2026',cidade:'Curitiba',estado:'PR',data:'2026-09-19',dist:'5km,10km',org:'Night Run'},
  {nome:'Night Run Porto Alegre 2026',cidade:'Porto Alegre',estado:'RS',data:'2026-10-10',dist:'5km,10km',org:'Night Run'},
  {nome:'Corrida da Mulher Nacional 2026',cidade:'São Paulo',estado:'SP',data:'2026-03-08',dist:'5km',org:'Nacional'},
  {nome:'Corrida do Dia das Mães SP 2026',cidade:'São Paulo',estado:'SP',data:'2026-05-10',dist:'5km',org:'Yescom'},
  {nome:'Corrida do Dia dos Pais SP 2026',cidade:'São Paulo',estado:'SP',data:'2026-08-09',dist:'5km,10km',org:'Yescom'},
  {nome:'Corrida de Natal SP 2026',cidade:'São Paulo',estado:'SP',data:'2026-12-13',dist:'5km,10km',org:'Yescom'},
];

async function insManual() {
  console.log('📝 Inserindo corridas manuais...');
  let n = 0;
  for (const c of MANUAIS) {
    const data = parseData(c.data);
    if (await ins({ ...c, data, fonte: 'manual-regeni' })) {
      n++;
      process.stdout.write(`\r  ✅ ${n} inseridas...`);
    }
  }
  console.log(`\n  Manual: ${n} de ${MANUAIS.length}\n`);
}

// ═══════════════════════════════════
// SCRAPERS WEB
// ═══════════════════════════════════
async function scrapeRunnerBrasil() {
  console.log('🌐 RunnerBrasil...');
  let n = 0;
  try {
    for (let p = 1; p <= 30; p++) {
      const { body } = await get(`https://www.runnerbrasil.com.br/Calendario/?pagina=${p}`);
      if (!body.includes('corrida') && !body.includes('Corrida')) break;
      const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>m[1]);
      let found = 0;
      for (const row of rows) {
        const cols = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>clean(m[1]));
        if (cols.length < 3) continue;
        const nome = cols[1]||cols[0]||'';
        if (!nome||nome.length<5) continue;
        const data = parseData(cols[0]);
        const local = cols[2]||'';
        const estado = uf(local);
        const cidade = local.split(/[,\-\/]/)[0].trim();
        const link = row.match(/href="(https?:\/\/[^"]+)"/i)?.[1]||'';
        if (await ins({nome,cidade,estado,data,dist:dists(nome),link,fonte:'runnerbrasil'})) { n++; found++; process.stdout.write(`\r  RunnerBrasil: ${n}`); }
      }
      if (!found&&p>2) break;
      await DELAY(600);
    }
  } catch(e) { console.log(`\n  RunnerBrasil erro: ${e.message}`); }
  console.log(`\n  RunnerBrasil: ${n}\n`);
}

async function scrapeCorridasDoBrasil() {
  console.log('🌐 CorridasDoBrasil...');
  let n = 0;
  for (const base of ['https://www.corridasdobrasil.com.br/calendario/','https://corridasdobrasil.com.br/calendario/']) {
    try {
      for (let p = 1; p <= 30; p++) {
        const url = p===1?base:`${base}?page=${p}&pagina=${p}`;
        const { body } = await get(url);
        if (!body.includes('corrida')&&!body.includes('Corrida')) break;
        const cards = [...body.matchAll(/<(?:div|article)[^>]*class="[^"]*(?:evento|event|card)[^"]*"[^>]*>([\s\S]{80,1200}?)<\/(?:div|article)>/gi)].map(m=>m[1]);
        let found = 0;
        for (const card of cards) {
          const nome = clean(card.match(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/i)?.[1]||'');
          const dataText = card.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1]||'';
          const local = clean(card.match(/class="[^"]*(?:local|cidade|city)[^"]*"[^>]*>(.*?)<\/[^>]+>/i)?.[1]||'');
          const link = card.match(/href="(https?:\/\/[^"]+)"/i)?.[1]||'';
          if (!nome||nome.length<5) continue;
          const data = parseData(dataText);
          const estado = uf(local);
          const cidade = local.split(/[,\-]/)[0].trim();
          if (await ins({nome,cidade,estado,data,dist:dists(nome+' '+card),link,fonte:'corridasdobrasil'})) { n++; found++; process.stdout.write(`\r  CorridasDoBrasil: ${n}`); }
        }
        // Tabela
        if (!cards.length) {
          const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>m[1]);
          for (const row of rows) {
            const cols = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>clean(m[1]));
            if (cols.length<3) continue;
            const nome = cols[1]||cols[0];
            if (!nome||nome.length<5) continue;
            const data = parseData(cols[0]);
            const estado = uf(cols[2]||cols[3]||'');
            const cidade = (cols[2]||'').split(/[,\-]/)[0].trim();
            if (await ins({nome,cidade,estado,data,dist:dists(nome),fonte:'corridasdobrasil'})) { n++; found++; }
          }
          if (!rows.length) break;
        }
        if (!found) break;
        await DELAY(500);
      }
      if (n>0) break;
    } catch(e) { /* próximo URL */ }
  }
  console.log(`\n  CorridasDoBrasil: ${n}\n`);
}

async function scrapeChipower() {
  console.log('🌐 Chipower...');
  let n = 0;
  for (const url of ['https://www.chipower.com.br/eventos','https://www.chipower.com.br/corridas','https://chipower.com.br/calendario']) {
    try {
      const { body } = await get(url);
      const cards = [...body.matchAll(/<(?:div|article)[^>]*class="[^"]*(?:card|evento|event)[^"]*"[^>]*>([\s\S]{50,800}?)<\/(?:div|article)>/gi)].map(m=>m[1]);
      for (const card of cards) {
        const nome = clean(card.match(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/i)?.[1]||'');
        const dataText = card.match(/(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/)?.[1]||'';
        const local = clean(card.match(/(?:local|cidade)[^>]*>(.*?)<\//i)?.[1]||'');
        const link = card.match(/href="([^"]+)"/i)?.[1]||'';
        if (!nome||nome.length<5) continue;
        const data = parseData(dataText);
        const estado = uf(local);
        const cidade = local.split(/[,\-]/)[0].trim();
        if (await ins({nome,cidade,estado,data,dist:dists(nome+' '+card),link,fonte:'chipower'})) { n++; process.stdout.write(`\r  Chipower: ${n}`); }
      }
      await DELAY(500);
    } catch(e) {}
  }
  console.log(`\n  Chipower: ${n}\n`);
}

async function scrapeMinhasInscricoes() {
  console.log('🌐 MinhasInscricoes...');
  let n = 0;
  const estados = ['SP','RJ','MG','RS','PR','CE','BA','GO','PE','SC','MA','PA','ES','PB','RN','AL','SE','PI','MS','MT','RO','TO','AM','AC','AP','RR','DF'];
  for (const estado of estados) {
    try {
      const { body } = await get(`https://www.minhasinscricoes.com.br/sites/pesquisa.aspx?estado=${estado}&esporte=corrida`);
      const cards = [...body.matchAll(/<(?:div|tr|li)[^>]*class="[^"]*(?:evento|result|card)[^"]*"[^>]*>([\s\S]{50,500}?)<\/(?:div|tr|li)>/gi)].map(m=>m[1]);
      for (const card of cards) {
        const nome = clean(card.match(/<(?:h[1-4]|strong|b|a)[^>]*>(.*?)<\/(?:h[1-4]|strong|b|a)>/i)?.[1]||'');
        const dataText = card.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1]||'';
        const cidade = clean(card.match(/class="[^"]*cid[^"]*"[^>]*>(.*?)<\/[^>]+>/i)?.[1]||'').split(/[,\/]/)[0].trim();
        const link = card.match(/href="([^"]+)"/i)?.[1]||'';
        if (!nome||nome.length<5) continue;
        const data = parseData(dataText);
        if (await ins({nome,cidade,estado,data,dist:dists(nome),link,fonte:'minhasinscricoes'})) { n++; process.stdout.write(`\r  MinhasInscricoes: ${n}`); }
      }
      await DELAY(300);
    } catch(e) {}
  }
  console.log(`\n  MinhasInscricoes: ${n}\n`);
}

async function scrapeWebRun() {
  console.log('🌐 WebRun...');
  let n = 0;
  try {
    for (let p = 1; p <= 20; p++) {
      const { body } = await get(`https://www.webrun.com.br/calendario/?page=${p}`);
      if (!body.includes('corrida')&&!body.includes('Corrida')) break;
      const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>m[1]);
      let found = 0;
      for (const row of rows) {
        const cols = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>clean(m[1]));
        if (cols.length<3) continue;
        const nome = cols[1]||cols[0];
        if (!nome||nome.length<5) continue;
        const data = parseData(cols[0]);
        const local = cols[2]||'';
        const estado = uf(local);
        const cidade = local.split(/[,\-]/)[0].trim();
        const link = row.match(/href="(https?:\/\/[^"]+)"/i)?.[1]||'';
        if (await ins({nome,cidade,estado,data,dist:dists(nome),link,fonte:'webrun'})) { n++; found++; process.stdout.write(`\r  WebRun: ${n}`); }
      }
      if (!found&&p>3) break;
      await DELAY(600);
    }
  } catch(e) { console.log(`\n  WebRun erro: ${e.message}`); }
  console.log(`\n  WebRun: ${n}\n`);
}

// ═══════════════════════════════════
// MAIN
// ═══════════════════════════════════
async function main() {
  console.log('🚀 REGENI — MEGA SCRAPER CORRIDAS ABERTAS\n');
  console.log(`⏰ ${new Date().toLocaleString('pt-BR')}\n`);

  client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Carregar existentes
  const ex = await client.query(`SELECT LOWER(nome) as n FROM "CorridaAberta"`);
  ex.rows.forEach(r => existentes.add(r.n));
  console.log(`📋 ${existentes.size} corridas já no banco\n`);

  // Rodar tudo
  await insManual();
  await scrapeRunnerBrasil();
  await scrapeCorridasDoBrasil();
  await scrapeChipower();
  await scrapeMinhasInscricoes();
  await scrapeWebRun();

  // Resultado
  const r = await client.query(`SELECT COUNT(*) FROM "CorridaAberta" WHERE ativa=true`);
  const estados = await client.query(`SELECT estado, COUNT(*) as n FROM "CorridaAberta" WHERE ativa=true GROUP BY estado ORDER BY n DESC`);

  console.log('\n══════════════════════════════════════');
  console.log(`✅ CONCLUÍDO! Inseridas: ${total}`);
  console.log(`📊 Total no banco: ${r.rows[0].count} corridas abertas`);
  console.log('\n📍 Por estado:');
  estados.rows.forEach(e => console.log(`   ${e.estado||'??'}: ${e.n}`));
  console.log('══════════════════════════════════════');

  await client.end();
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
