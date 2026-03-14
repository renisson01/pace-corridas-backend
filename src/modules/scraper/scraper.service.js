/**
 * PACE BRAZIL — Motor de Scraping de Corridas v1.0
 * 
 * Arquitetura:
 * 1. Framework central com deduplicação por (nome_normalizado + data + cidade)
 * 2. Scrapers individuais por fonte (Cheerio para HTML, fetch para APIs)
 * 3. Normalização de dados (estado, cidade, distâncias, datas)
 * 4. Rota manual + agendável via cron
 * 
 * Fontes classificadas:
 * - TIER 1 (HTML estático — Cheerio): ~20 sites
 * - TIER 2 (SPA/JavaScript — precisa Puppeteer): ~10 sites (stub)
 * - TIER 3 (API JSON descoberta): quando disponível
 */

import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import * as cheerio from 'cheerio';

const prisma = new PrismaClient();

// ==================== NORMALIZAÇÃO ====================

function removerAcentos(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizarNome(nome) {
  if (!nome) return '';
  return removerAcentos(nome)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarCidade(cidade) {
  if (!cidade) return '';
  return removerAcentos(cidade)
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const ESTADOS_BR = {
  'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM',
  'bahia': 'BA', 'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES',
  'goias': 'GO', 'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
  'minas gerais': 'MG', 'para': 'PA', 'paraiba': 'PB', 'parana': 'PR',
  'pernambuco': 'PE', 'piaui': 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', 'rondonia': 'RO',
  'roraima': 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
  'sergipe': 'SE', 'tocantins': 'TO',
};

function normalizarEstado(uf) {
  if (!uf) return '';
  const clean = removerAcentos(uf).trim().toUpperCase();
  if (clean.length === 2 && Object.values(ESTADOS_BR).includes(clean)) return clean;
  const lower = removerAcentos(uf).toLowerCase().trim();
  return ESTADOS_BR[lower] || clean.substring(0, 2);
}

function parsearCidadeEstado(texto) {
  if (!texto) return { cidade: '', estado: '' };
  // Formatos comuns: "Cidade/UF", "Cidade - UF", "Cidade, UF", "Cidade / UF"
  const patterns = [
    /^(.+?)\s*[-\/,]\s*([A-Z]{2})\s*$/i,
    /^(.+?)\s*[-\/,]\s*(\w+)\s*$/i,
  ];
  for (const p of patterns) {
    const m = texto.trim().match(p);
    if (m) return { cidade: m[1].trim(), estado: normalizarEstado(m[2]) };
  }
  return { cidade: texto.trim(), estado: '' };
}

function parsearData(texto, ano = new Date().getFullYear()) {
  if (!texto) return null;
  const clean = texto.replace(/\s+/g, ' ').trim();

  // DD/MM/YYYY
  const m1 = clean.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m1) return new Date(+m1[3], +m1[2] - 1, +m1[1]);

  // DD/MM
  const m2 = clean.match(/(\d{1,2})\/(\d{1,2})/);
  if (m2) return new Date(ano, +m2[2] - 1, +m2[1]);

  // "15 de março" / "15 de março de 2026"
  const meses = {
    'janeiro': 0, 'fevereiro': 1, 'marco': 2, 'março': 2, 'abril': 3,
    'maio': 4, 'junho': 5, 'julho': 6, 'agosto': 7, 'setembro': 8,
    'outubro': 9, 'novembro': 10, 'dezembro': 11,
  };
  const m3 = clean.match(/(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?/i);
  if (m3) {
    const mesNorm = removerAcentos(m3[2].toLowerCase());
    const mesIdx = meses[mesNorm];
    if (mesIdx !== undefined) {
      return new Date(m3[3] ? +m3[3] : ano, mesIdx, +m3[1]);
    }
  }

  // ISO / Date string
  const d = new Date(clean);
  if (!isNaN(d.getTime())) return d;

  return null;
}

function extrairDistancias(texto) {
  if (!texto) return '';
  // Encontra padrões como "5K", "10km", "21.1km", "3 km", "meia maratona", "maratona"
  const matches = texto.match(/\d+(?:[.,]\d+)?\s*k(?:m|ilômetros)?/gi) || [];
  let dists = matches.map(m => m.replace(/\s/g, '').replace(',', '.').toUpperCase());

  if (/meia[\s-]?maratona/i.test(texto)) dists.push('21.1KM');
  if (/maratona/i.test(texto) && !/meia/i.test(texto)) dists.push('42.2KM');

  // Deduplica
  dists = [...new Set(dists)];
  return dists.join(', ') || texto.substring(0, 50);
}

// ==================== DEDUPLICAÇÃO ====================

/**
 * Verifica se uma corrida já existe no banco
 * Critérios: nome normalizado similar + mesma data + mesma cidade
 */
async function corridaExiste(nome, data, cidade) {
  if (!nome || !data) return true; // Se falta dado essencial, pula

  const nomeNorm = normalizarNome(nome);
  const cidadeNorm = normalizarCidade(cidade);

  // Busca corridas na mesma data (±1 dia por segurança)
  const umDia = 24 * 60 * 60 * 1000;
  const dataInicio = new Date(data.getTime() - umDia);
  const dataFim = new Date(data.getTime() + umDia);

  const existentes = await prisma.corridaAberta.findMany({
    where: {
      data: { gte: dataInicio, lte: dataFim },
    },
    select: { nome: true, cidade: true, id: true }
  });

  for (const e of existentes) {
    const nomeExist = normalizarNome(e.nome);
    const cidadeExist = normalizarCidade(e.cidade);

    // Match exato ou similaridade alta
    if (nomeExist === nomeNorm) return true;

    // Similaridade: se 80%+ das palavras coincidem E mesma cidade
    const palavrasNovas = nomeNorm.split(' ').filter(p => p.length > 2);
    const palavrasExist = nomeExist.split(' ').filter(p => p.length > 2);
    if (palavrasNovas.length > 0 && palavrasExist.length > 0) {
      const comuns = palavrasNovas.filter(p => palavrasExist.includes(p));
      const similaridade = comuns.length / Math.max(palavrasNovas.length, palavrasExist.length);
      if (similaridade >= 0.7 && cidadeNorm === cidadeExist) return true;
    }
  }

  return false;
}

/**
 * Salva uma corrida no banco (se não for duplicata)
 * Retorna: { salva: true/false, motivo: string }
 */
async function salvarCorrida(dados) {
  const { nome, data, cidade, estado, distancias, linkInscricao, fonte, imageUrl } = dados;

  if (!nome || !data || !cidade) {
    return { salva: false, motivo: 'dados_incompletos' };
  }

  // Data no passado? Pula
  if (data < new Date()) {
    return { salva: false, motivo: 'data_passada' };
  }

  // Deduplicação
  const existe = await corridaExiste(nome, data, cidade);
  if (existe) {
    return { salva: false, motivo: 'duplicata' };
  }

  try {
    await prisma.corridaAberta.create({
      data: {
        nome: nome.trim().substring(0, 200),
        data,
        cidade: cidade.trim(),
        estado: normalizarEstado(estado),
        distancias: distancias || '',
        linkInscricao: linkInscricao || '',
        fonte: fonte || 'scraper',
        imageUrl: imageUrl || null,
        ativa: true,
      }
    });
    return { salva: true, motivo: 'nova' };
  } catch (e) {
    return { salva: false, motivo: `erro: ${e.message}` };
  }
}

// ==================== FETCH HELPER ====================

async function fetchHTML(url, encoding = 'utf-8') {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PaceBrazilBot/1.0; +https://pacebrazil.com)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buffer = await resp.arrayBuffer();
    const decoder = new TextDecoder(encoding);
    return decoder.decode(buffer);
  } catch (e) {
    console.error(`[SCRAPER] Fetch falhou: ${url} → ${e.message}`);
    return null;
  }
}

async function fetchJSON(url) {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PaceBrazilBot/1.0)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (e) {
    console.error(`[SCRAPER] JSON falhou: ${url} → ${e.message}`);
    return null;
  }
}

// ==================== SCRAPERS INDIVIDUAIS ====================

// ─── TIER 1: HTML Estático (Cheerio) ───

async function scraperMinhasInscricoes() {
  const fonte = 'minhasinscricoes.com.br';
  const resultados = [];

  const html = await fetchHTML('https://minhasinscricoes.com.br/pt-br/calendario');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  // Cada card de evento tem título h5, data, e local
  $('h5, .card-title, .evento-titulo').each((_, el) => {
    const card = $(el).closest('.card, .evento-card, [class*="card"]').length ?
      $(el).closest('.card, .evento-card, [class*="card"]') :
      $(el).parent().parent();

    const nome = $(el).text().trim();
    const textoCard = card.text();

    // Buscar data (DD/MM/YYYY)
    const dataMatch = textoCard.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    // Buscar cidade/UF
    const localMatch = textoCard.match(/([A-ZÀ-Ú][a-zà-ú]+(?:\s[A-ZÀ-Ú][a-zà-ú]+)*)\s*[,\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1] : '';
    const estado = localMatch ? localMatch[2] : '';

    // Link de inscrição
    const link = card.find('a[href*="Redirecionar"], a[href*="saiba"], a[href*="inscri"]').attr('href') || '';

    if (nome && nome.length > 3) {
      resultados.push({ nome, data, cidade, estado, distancias: '', linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperEuCorro() {
  const fonte = 'eucorro.com';
  const resultados = [];

  const html = await fetchHTML('https://www.eucorro.com/calendario/', 'iso-8859-1');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  // Formato: tabela com colunas Prova, Local, Distância, Data
  $('table tr').each((_, row) => {
    const cols = $(row).find('td');
    if (cols.length < 4) return;

    const nome = $(cols[0]).text().trim();
    const localTexto = $(cols[1]).text().trim();
    const distTexto = $(cols[2]).text().trim();
    const dataTexto = $(cols[3]).text().trim();
    const link = $(cols[0]).find('a').attr('href') || '';

    if (!nome || nome.length < 3) return;

    const { cidade, estado } = parsearCidadeEstado(localTexto);
    const data = parsearData(dataTexto);
    const distancias = extrairDistancias(distTexto);

    resultados.push({ nome, data, cidade, estado, distancias, linkInscricao: link, fonte, imageUrl: null });
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperCronoTag() {
  const fonte = 'cronotag.com.br';
  const resultados = [];

  const html = await fetchHTML('https://www.cronotag.com.br/v2/eventos.php', 'windows-1252');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  // Cards com h4 (nome), data, cidade
  $('h4, .evento-nome, .card-title').each((_, el) => {
    const parent = $(el).parent().parent();
    const nome = $(el).text().trim().replace(/\.\.\.$/, '');
    const textoAll = parent.text();

    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = parent.find('a[href*="detalhe"]').attr('href') || '';
    const fullLink = link.startsWith('http') ? link : `https://www.cronotag.com.br/v2/${link}`;

    if (nome && nome.length > 3 && data) {
      resultados.push({ nome, data, cidade, estado, distancias: '', linkInscricao: fullLink, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperSuperCrono() {
  const fonte = 'supercrono.com.br';
  const resultados = [];

  const html = await fetchHTML('https://supercrono.com.br/eventos');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h5, .elementor-heading-title, .entry-title').each((_, el) => {
    const card = $(el).closest('article, .elementor-widget-wrap, .evento-card, div').first();
    const nome = $(el).text().trim();
    const textoAll = card.text();

    const dataMatch = textoAll.match(/Data do evento:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
      textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = card.find('a[href*="inscrev"], a[href*="ticketsports"], a[href*="evento"]').attr('href') || '';

    if (nome && nome.length > 5 && data) {
      resultados.push({ nome, data, cidade, estado, distancias: '', linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperCronoServ() {
  const fonte = 'cronoserv.com.br';
  const resultados = [];

  const html = await fetchHTML('https://www.cronoserv.com.br/eventos');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h3').each((_, el) => {
    const card = $(el).closest('div, article, section').first();
    const nome = $(el).text().trim();
    const textoAll = card.text();

    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = card.find('a').attr('href') || '';
    const fullLink = link.startsWith('http') ? link : `https://www.cronoserv.com.br${link}`;

    if (nome && nome.length > 3 && data) {
      resultados.push({ nome, data, cidade, estado, distancias: '', linkInscricao: fullLink, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperChiPower() {
  const fonte = 'chipower.com.br';
  const resultados = [];

  const html = await fetchHTML('https://www.chipower.com.br/eventos');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h2, h3, h4, .event-title, .titulo-evento').each((_, el) => {
    const card = $(el).closest('.event, .evento, article, .card, div').first();
    const nome = $(el).text().trim();
    if (!nome || nome.length < 4) return;

    const textoAll = card.text();
    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/) ||
      textoAll.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
    const data = dataMatch ? parsearData(dataMatch[0]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = card.find('a').first().attr('href') || '';

    if (data) {
      resultados.push({ nome, data, cidade, estado, distancias: extrairDistancias(textoAll), linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperChipTiming() {
  const fonte = 'chiptiming.com.br';
  const resultados = [];

  const html = await fetchHTML('https://eventos.chiptiming.com.br');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h2, h3, h4, .event-name, .titulo').each((_, el) => {
    const card = $(el).closest('.event, .card, article, .item, div').first();
    const nome = $(el).text().trim();
    if (!nome || nome.length < 4) return;

    const textoAll = card.text();
    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = card.find('a').first().attr('href') || '';

    if (data) {
      resultados.push({ nome, data, cidade, estado, distancias: '', linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperEsporteCorrida() {
  const fonte = 'esportecorrida.com.br';
  const resultados = [];

  const html = await fetchHTML('https://esportecorrida.com.br/v1/eventos.php', 'windows-1252');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h3, h4, .evento-titulo, .card-title').each((_, el) => {
    const card = $(el).closest('div, article, .card').first();
    const nome = $(el).text().trim();
    if (!nome || nome.length < 4) return;

    const textoAll = card.text();
    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = card.find('a').first().attr('href') || '';

    if (data) {
      resultados.push({ nome, data, cidade, estado, distancias: '', linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperChronoMax() {
  const fonte = 'chronomax.com.br';
  const resultados = [];

  const html = await fetchHTML('https://chronomax.com.br/calendario');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h2, h3, h4, .event-title, .titulo').each((_, el) => {
    const card = $(el).closest('.event, .card, article, div').first();
    const nome = $(el).text().trim();
    if (!nome || nome.length < 4) return;

    const textoAll = card.text();
    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = card.find('a').first().attr('href') || '';

    if (data) {
      resultados.push({ nome, data, cidade, estado, distancias: extrairDistancias(textoAll), linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperCentralResultados() {
  const fonte = 'centralderesultados.com.br';
  const resultados = [];

  const html = await fetchHTML('https://centralderesultados.com.br/');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h2, h3, h4, .titulo-evento, .event-name').each((_, el) => {
    const card = $(el).closest('.event, .card, article, div').first();
    const nome = $(el).text().trim();
    if (!nome || nome.length < 4) return;

    const textoAll = card.text();
    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = card.find('a').first().attr('href') || '';

    if (data) {
      resultados.push({ nome, data, cidade, estado, distancias: '', linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperTfSports() {
  const fonte = 'tfsports.com.br';
  const resultados = [];

  const html = await fetchHTML('https://www.tfsports.com.br/run-series/');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h2, h3, h4, .event-title').each((_, el) => {
    const card = $(el).closest('.event, .card, article, div').first();
    const nome = $(el).text().trim();
    if (!nome || nome.length < 4) return;

    const textoAll = card.text();
    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = card.find('a').first().attr('href') || '';

    if (data) {
      resultados.push({ nome, data, cidade, estado, distancias: extrairDistancias(textoAll), linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperRaveliSports() {
  const fonte = 'ravelisports.com.br';
  const resultados = [];

  const html = await fetchHTML('https://www.ravelisports.com.br/eventos');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h2, h3, h4, .titulo, .event-title').each((_, el) => {
    const card = $(el).closest('.event, .card, article, div').first();
    const nome = $(el).text().trim();
    if (!nome || nome.length < 4) return;

    const textoAll = card.text();
    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = card.find('a').first().attr('href') || '';

    if (data) {
      resultados.push({ nome, data, cidade, estado, distancias: '', linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperCronosChip() {
  const fonte = 'cronoschip.com.br';
  const resultados = [];

  const html = await fetchHTML('https://cronoschip.com.br/provas');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h2, h3, h4, .titulo, .prova-nome').each((_, el) => {
    const card = $(el).closest('.prova, .card, article, div').first();
    const nome = $(el).text().trim();
    if (!nome || nome.length < 4) return;

    const textoAll = card.text();
    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = card.find('a').first().attr('href') || '';

    if (data) {
      resultados.push({ nome, data, cidade, estado, distancias: '', linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperCronoCorridas() {
  const fonte = 'cronocorridas.com.br';
  const resultados = [];

  const html = await fetchHTML('https://www.cronocorridas.com.br/eventos');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h2, h3, h4, .titulo, .event-title').each((_, el) => {
    const card = $(el).closest('.event, .card, article, div').first();
    const nome = $(el).text().trim();
    if (!nome || nome.length < 4) return;

    const textoAll = card.text();
    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = card.find('a').first().attr('href') || '';

    if (data) {
      resultados.push({ nome, data, cidade, estado, distancias: '', linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperO2Corre() {
  const fonte = 'o2corre.com.br';
  const resultados = [];

  const html = await fetchHTML('https://www.o2corre.com.br/calendario/');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h2, h3, h4, .titulo, .event-title').each((_, el) => {
    const card = $(el).closest('.event, .card, article, div').first();
    const nome = $(el).text().trim();
    if (!nome || nome.length < 4) return;

    const textoAll = card.text();
    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = card.find('a').first().attr('href') || '';

    if (data) {
      resultados.push({ nome, data, cidade, estado, distancias: '', linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperSportTimer() {
  const fonte = 'sporttimer.com.br';
  const resultados = [];

  const html = await fetchHTML('https://www.sporttimer.com.br/site/calendario.php');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h2, h3, h4, .titulo, .event-name, td a').each((_, el) => {
    const nome = $(el).text().trim();
    if (!nome || nome.length < 4) return;

    const row = $(el).closest('tr, .event, .card, div').first();
    const textoAll = row.text();

    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = $(el).attr('href') || '';

    if (data && !nome.includes('Calendário')) {
      resultados.push({ nome, data, cidade, estado, distancias: '', linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperTriChip() {
  const fonte = 'trichip.com.br';
  const resultados = [];

  const html = await fetchHTML('https://www.trichip.com.br/eventos');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h2, h3, h4, .titulo, .event-title').each((_, el) => {
    const card = $(el).closest('.event, .card, article, div').first();
    const nome = $(el).text().trim();
    if (!nome || nome.length < 4) return;

    const textoAll = card.text();
    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = card.find('a').first().attr('href') || '';

    if (data) {
      resultados.push({ nome, data, cidade, estado, distancias: '', linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperCentralDaCorrida() {
  const fonte = 'centraldacorrida.com.br';
  const resultados = [];

  const html = await fetchHTML('https://centraldacorrida.com.br/');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h2, h3, h4, .titulo, .event-title, .corrida-nome').each((_, el) => {
    const card = $(el).closest('.corrida, .event, .card, article, div').first();
    const nome = $(el).text().trim();
    if (!nome || nome.length < 4) return;

    const textoAll = card.text();
    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = card.find('a').first().attr('href') || '';

    if (data) {
      resultados.push({ nome, data, cidade, estado, distancias: '', linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperAhotu() {
  const fonte = 'ahotu.com';
  const resultados = [];

  const html = await fetchHTML('https://www.ahotu.com/pt-BR/calendario/corrida/meia-maratona/brasil');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h2, h3, h4, .event-name, .race-name, a[href*="/corrida/"]').each((_, el) => {
    const card = $(el).closest('.race, .event, .card, article, li, div').first();
    const nome = $(el).text().trim();
    if (!nome || nome.length < 4) return;

    const textoAll = card.text();
    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/) ||
      textoAll.match(/(\d{1,2})\s+(?:de\s+)?(\w+)\s+(\d{4})/i);
    const data = dataMatch ? parsearData(dataMatch[0]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–,\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = $(el).attr('href') || card.find('a').first().attr('href') || '';
    const fullLink = link.startsWith('http') ? link : `https://www.ahotu.com${link}`;

    if (data) {
      resultados.push({ nome, data, cidade, estado, distancias: '21.1KM', linkInscricao: fullLink, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperCorridinhas() {
  const fonte = 'corridinhas.com.br';
  const resultados = [];

  const html = await fetchHTML('https://www.corridinhas.com.br/');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h2, h3, h4, .titulo, .event-title, .corrida-nome').each((_, el) => {
    const card = $(el).closest('.corrida, .event, .card, article, div').first();
    const nome = $(el).text().trim();
    if (!nome || nome.length < 4) return;

    const textoAll = card.text();
    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = card.find('a').first().attr('href') || '';

    if (data) {
      resultados.push({ nome, data, cidade, estado, distancias: extrairDistancias(textoAll), linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperCronosCariri() {
  const fonte = 'cronoscariri.com.br';
  const resultados = [];

  const html = await fetchHTML('https://cronoscariri.com.br/');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h2, h3, h4, .titulo, .event-title').each((_, el) => {
    const card = $(el).closest('.event, .card, article, div').first();
    const nome = $(el).text().trim();
    if (!nome || nome.length < 4) return;

    const textoAll = card.text();
    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = card.find('a').first().attr('href') || '';

    if (data) {
      resultados.push({ nome, data, cidade, estado, distancias: '', linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperAssessocor() {
  const fonte = 'assessocor.online';
  const resultados = [];

  const html = await fetchHTML('https://www.assessocor.online/eventos');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h2, h3, h4, .titulo, .event-title').each((_, el) => {
    const card = $(el).closest('.event, .card, article, div').first();
    const nome = $(el).text().trim();
    if (!nome || nome.length < 4) return;

    const textoAll = card.text();
    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = card.find('a').first().attr('href') || '';

    if (data) {
      resultados.push({ nome, data, cidade, estado, distancias: '', linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

async function scraperLeveYouRun() {
  const fonte = 'leveyourun.com';
  const resultados = [];

  const html = await fetchHTML('https://leveyourun.com/');
  if (!html) return { fonte, total: 0, novas: 0, erro: 'fetch_falhou' };

  const $ = cheerio.load(html);

  $('h2, h3, h4, .titulo, .event-title, .corrida').each((_, el) => {
    const card = $(el).closest('.event, .card, article, div').first();
    const nome = $(el).text().trim();
    if (!nome || nome.length < 4) return;

    const textoAll = card.text();
    const dataMatch = textoAll.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const data = dataMatch ? parsearData(dataMatch[1]) : null;

    const localMatch = textoAll.match(/([A-ZÀ-Ú][\wà-ú\s]+?)\s*[-–\/]\s*([A-Z]{2})/);
    const cidade = localMatch ? localMatch[1].trim() : '';
    const estado = localMatch ? localMatch[2] : '';

    const link = card.find('a').first().attr('href') || '';

    if (data) {
      resultados.push({ nome, data, cidade, estado, distancias: '', linkInscricao: link, fonte, imageUrl: null });
    }
  });

  let novas = 0;
  for (const r of resultados) {
    const res = await salvarCorrida(r);
    if (res.salva) novas++;
  }

  return { fonte, total: resultados.length, novas };
}

// ─── REGISTRO DE TODOS OS SCRAPERS ───

const SCRAPERS = {
  minhasinscricoes: { fn: scraperMinhasInscricoes, tier: 1, descricao: 'Minhas Inscrições — maior plataforma BR' },
  eucorro: { fn: scraperEuCorro, tier: 1, descricao: 'EuCorro — calendário PR/Sul' },
  cronotag: { fn: scraperCronoTag, tier: 1, descricao: 'CronoTag — eventos MG' },
  supercrono: { fn: scraperSuperCrono, tier: 1, descricao: 'Super Crono — eventos SC' },
  cronoserv: { fn: scraperCronoServ, tier: 1, descricao: 'CronoServ — SP/PR' },
  chipower: { fn: scraperChiPower, tier: 1, descricao: 'ChiPower — multirregional' },
  chiptiming: { fn: scraperChipTiming, tier: 1, descricao: 'ChipTiming — multirregional' },
  esportecorrida: { fn: scraperEsporteCorrida, tier: 1, descricao: 'Esporte Corrida — multirregional' },
  chronomax: { fn: scraperChronoMax, tier: 1, descricao: 'ChronoMax — calendário geral' },
  centralresultados: { fn: scraperCentralResultados, tier: 1, descricao: 'Central de Resultados' },
  tfsports: { fn: scraperTfSports, tier: 1, descricao: 'TF Sports — Run Series' },
  ravelisports: { fn: scraperRaveliSports, tier: 1, descricao: 'Raveli Sports — eventos' },
  cronoschip: { fn: scraperCronosChip, tier: 1, descricao: 'CronosChip — provas' },
  cronocorridas: { fn: scraperCronoCorridas, tier: 1, descricao: 'Crono Corridas — eventos' },
  o2corre: { fn: scraperO2Corre, tier: 1, descricao: 'O2 Corre — calendário' },
  sporttimer: { fn: scraperSportTimer, tier: 1, descricao: 'SportTimer — calendário' },
  trichip: { fn: scraperTriChip, tier: 1, descricao: 'TriChip — eventos' },
  centraldacorrida: { fn: scraperCentralDaCorrida, tier: 1, descricao: 'Central da Corrida' },
  ahotu: { fn: scraperAhotu, tier: 1, descricao: 'Ahotu — meias-maratonas BR' },
  corridinhas: { fn: scraperCorridinhas, tier: 1, descricao: 'Corridinhas — calendário' },
  cronoscariri: { fn: scraperCronosCariri, tier: 1, descricao: 'Cronos Cariri — CE' },
  assessocor: { fn: scraperAssessocor, tier: 1, descricao: 'Assessocor — eventos' },
  leveyourun: { fn: scraperLeveYouRun, tier: 1, descricao: 'Leve You Run' },

  // TIER 2 — SPAs que precisam de Puppeteer (stubs)
  estounessa: { fn: async () => ({ fonte: 'estounessa.com.br', total: 0, novas: 0, erro: 'SPA_PRECISA_PUPPETEER' }), tier: 2, descricao: 'Estou Nessa — SPA Angular' },
  incentivoesporte: { fn: async () => ({ fonte: 'incentivoesporte.com.br', total: 0, novas: 0, erro: 'SPA_PRECISA_PUPPETEER' }), tier: 2, descricao: 'Incentivo Esporte — SPA' },
  morrmt: { fn: async () => ({ fonte: 'morro-mt.com.br', total: 0, novas: 0, erro: 'SPA_PRECISA_PUPPETEER' }), tier: 2, descricao: 'Morro MT — SPA' },
  correparaiba: { fn: async () => ({ fonte: 'correparaiba.com', total: 0, novas: 0, erro: 'SPA_PRECISA_PUPPETEER' }), tier: 2, descricao: 'Corre Paraíba — SPA' },
  picrono: { fn: async () => ({ fonte: 'picrono.com.br', total: 0, novas: 0, erro: 'SPA_PRECISA_PUPPETEER' }), tier: 2, descricao: 'Picrono — RaceTag SPA' },
  acronoesportes: { fn: async () => ({ fonte: 'acronoesportes.com.br', total: 0, novas: 0, erro: 'SPA_PRECISA_PUPPETEER' }), tier: 2, descricao: 'Acrono Esportes — RaceTag SPA' },
  recebedigital: { fn: async () => ({ fonte: 'recebedigital.com.br', total: 0, novas: 0, erro: 'SPA_PRECISA_PUPPETEER' }), tier: 2, descricao: 'Recebe Digital — SPA' },
  roadrunners: { fn: async () => ({ fonte: 'roadrunners.run', total: 0, novas: 0, erro: 'SPA_PRECISA_PUPPETEER' }), tier: 2, descricao: 'Road Runners — SPA' },
  onsports: { fn: async () => ({ fonte: 'onsportsoficial.com.br', total: 0, novas: 0, erro: 'SPA_PRECISA_PUPPETEER' }), tier: 2, descricao: 'OnSports — SPA' },
  ingresso84: { fn: async () => ({ fonte: 'ingresso84.com.br', total: 0, novas: 0, erro: 'SPA_PRECISA_PUPPETEER' }), tier: 2, descricao: 'Ingresso84 — SPA' },
  races: { fn: async () => ({ fonte: 'races.com.br', total: 0, novas: 0, erro: 'SPA_PRECISA_PUPPETEER' }), tier: 2, descricao: 'Races.com.br — SPA' },
};

// ==================== EXECUTOR ====================

/**
 * Executa todos os scrapers (ou específicos) e retorna relatório
 * @param {string[]} [fontes] - lista de fontes específicas (ou todas se vazio)
 * @param {number} [tier] - filtrar por tier (1, 2, ou null para todos)
 */
async function executarScraping(fontes = null, tier = 1) {
  const inicio = Date.now();
  const scraperList = fontes
    ? fontes.filter(f => SCRAPERS[f]).map(f => ({ key: f, ...SCRAPERS[f] }))
    : Object.entries(SCRAPERS)
      .filter(([_, s]) => tier ? s.tier === tier : true)
      .map(([key, s]) => ({ key, ...s }));

  console.log(`[SCRAPER] Iniciando scraping de ${scraperList.length} fontes...`);

  const resultados = [];
  for (const scraper of scraperList) {
    console.log(`[SCRAPER] → ${scraper.key} (${scraper.descricao})`);
    try {
      const resultado = await scraper.fn();
      resultados.push({ ...resultado, key: scraper.key });
      console.log(`[SCRAPER] ✅ ${scraper.key}: ${resultado.novas} novas de ${resultado.total} encontradas`);
    } catch (e) {
      resultados.push({ fonte: scraper.key, total: 0, novas: 0, erro: e.message, key: scraper.key });
      console.error(`[SCRAPER] ❌ ${scraper.key}: ${e.message}`);
    }

    // Delay entre scrapers (respeitar os servidores)
    await new Promise(r => setTimeout(r, 2000));
  }

  const duracao = Math.round((Date.now() - inicio) / 1000);
  const totalEncontradas = resultados.reduce((s, r) => s + (r.total || 0), 0);
  const totalNovas = resultados.reduce((s, r) => s + (r.novas || 0), 0);
  const totalErros = resultados.filter(r => r.erro).length;

  const relatorio = {
    executadoEm: new Date().toISOString(),
    duracaoSegundos: duracao,
    fontesExecutadas: scraperList.length,
    totalEncontradas,
    totalNovas,
    totalErros,
    detalhes: resultados,
  };

  console.log(`[SCRAPER] ══════════════════════════════════════`);
  console.log(`[SCRAPER] Concluído em ${duracao}s`);
  console.log(`[SCRAPER] ${totalEncontradas} encontradas → ${totalNovas} novas salvas → ${totalErros} erros`);
  console.log(`[SCRAPER] ══════════════════════════════════════`);

  return relatorio;
}

// ==================== EXPORTAÇÕES ====================

export {
  executarScraping,
  SCRAPERS,
  salvarCorrida,
  corridaExiste,
  normalizarNome,
  parsearData,
  parsearCidadeEstado,
  extrairDistancias,
};
