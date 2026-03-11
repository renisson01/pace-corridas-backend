/**
 * PACE — Scraper de Corridas Abertas
 * Busca corridas futuras com inscrições abertas no Brasil
 * Fontes: Ticket Sports, Sympla, Minhas Inscrições
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = msg => console.log(`[PACE-RaceFinder] ${new Date().toISOString()} | ${msg}`);

export let scraperStatus = {
  rodando: false,
  ultimaExecucao: null,
  totalEncontrado: 0,
  logs: [],
  progresso: { atual: 0, total: 0, fase: '' }
};

const addLog = msg => {
  log(msg);
  scraperStatus.logs.push({ time: new Date().toISOString(), msg });
  if (scraperStatus.logs.length > 100) scraperStatus.logs.shift();
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; PACE-Bot/1.0; +https://pace-corridas.app)',
  'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Cache-Control': 'no-cache',
};

const ESTADOS = ['SP','RJ','MG','RS','PR','SC','CE','BA','PE','GO','DF','SE','AL','MA','PA','AM','MT','MS','RN','PB','PI','ES','RO','TO','AC','AP','RR'];

// ─── UTILS ────────────────────────────────────────────────────
function gerarHash(nome, data, estado) {
  const key = `${normalizar(nome)}_${data}_${estado}`.toLowerCase();
  return crypto.createHash('md5').update(key).digest('hex');
}

function normalizar(t) {
  if (!t) return '';
  return t.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function parseData(texto) {
  if (!texto) return null;
  texto = texto.trim().replace(/\s+/g, ' ');

  // DD/MM/YYYY
  const m1 = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m1) {
    const d = new Date(`${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}T12:00:00Z`);
    if (!isNaN(d) && d > new Date('2020-01-01')) return d;
  }

  // "23 de agosto de 2026" ou "23 ago 2026"
  const meses = {jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
  const m2 = texto.match(/(\d{1,2})\s+(?:de\s+)?(\w{3,9})\s+(?:de\s+)?(\d{4})/i);
  if (m2) {
    const mes = meses[m2[2].toLowerCase().slice(0,3)];
    if (mes) {
      const d = new Date(`${m2[3]}-${String(mes).padStart(2,'0')}-${m2[1].padStart(2,'0')}T12:00:00Z`);
      if (!isNaN(d)) return d;
    }
  }

  // ISO ou timestamp direto
  const d = new Date(texto);
  if (!isNaN(d) && d > new Date('2020-01-01')) return d;
  return null;
}

function extrairDistancias(texto) {
  if (!texto) return '';
  const matches = [];
  const re = /(\d+(?:[.,]\d+)?)\s*km/gi;
  let m;
  while ((m = re.exec(texto)) !== null) {
    const km = parseFloat(m[1].replace(',', '.'));
    if (km >= 1 && km <= 200) matches.push(`${km}km`);
  }
  return [...new Set(matches)].sort((a,b) => parseFloat(a)-parseFloat(b)).join(', ');
}

function extrairPreco(texto) {
  if (!texto) return null;
  const m = texto.match(/R\$\s*(\d+(?:[.,]\d+)?)/i);
  if (m) return parseFloat(m[1].replace('.','').replace(',','.'));
  return null;
}

function extrairEstado(texto) {
  if (!texto) return '';
  const m = texto.match(/\b([A-Z]{2})\b/);
  return m ? m[1] : '';
}

// ─── SALVAR ───────────────────────────────────────────────────
async function salvar(dados) {
  const { nome, data, cidade, estado, distancias, urlInscricao, plataforma, fonteId, foto, precoMin, organizador } = dados;
  if (!nome || nome.length < 4 || !estado || !urlInscricao) return null;

  const dataFinal = data || new Date(Date.now() + 60 * 86400000);
  const hash = gerarHash(nome, dataFinal.toISOString().split('T')[0], estado);
  const ativa = dataFinal > new Date();

  try {
    return await prisma.corridaAberta.upsert({
      where: { id: hash },
      update: { nome, data: dataFinal, cidade: cidade||'', estado, distancias: distancias||'', linkInscricao: urlInscricao, fonte: plataforma, imageUrl: foto||null, preco: precoMin||null, organizador: organizador||null, ativa },
      create: { id: hash, nome, data: dataFinal, cidade: cidade||'', estado, distancias: distancias||'', linkInscricao: urlInscricao, fonte: plataforma, imageUrl: foto||null, preco: precoMin||null, organizador: organizador||null, ativa }
    });
  } catch(e) {
    // Se não tem campo 'id' customizável, tenta sem where único
    try {
      const existing = await prisma.corridaAberta.findFirst({
        where: {
          nome: { contains: nome.slice(0, 25), mode: 'insensitive' },
          estado,
          data: { gte: new Date(dataFinal.getTime() - 3*86400000), lte: new Date(dataFinal.getTime() + 3*86400000) }
        }
      });
      if (existing) {
        return await prisma.corridaAberta.update({
          where: { id: existing.id },
          data: { linkInscricao: urlInscricao, fonte: plataforma, imageUrl: foto||existing.imageUrl, preco: precoMin||existing.preco }
        });
      }
      return await prisma.corridaAberta.create({
        data: { nome, data: dataFinal, cidade: cidade||'', estado, distancias: distancias||'', linkInscricao: urlInscricao, fonte: plataforma, imageUrl: foto||null, preco: precoMin||null, organizador: organizador||null, ativa }
      });
    } catch(e2) {
      addLog(`❌ Erro ao salvar "${nome}": ${e2.message}`);
      return null;
    }
  }
}

// ─── SCRAPER: TICKET SPORTS ───────────────────────────────────
async function scraperTicketSports(estados = ESTADOS) {
  addLog('🎯 Iniciando Ticket Sports...');
  let total = 0;

  for (const estado of estados) {
    scraperStatus.progresso = { atual: ESTADOS.indexOf(estado)+1, total: ESTADOS.length, fase: `Ticket Sports — ${estado}` };

    try {
      // Página de listagem por estado
      const url = `https://www.ticketsports.com.br/Calendario/Todos-os-organizadores/Corrida-de-rua/${estado}/Todas-as-cidades/0`;
      addLog(`📄 TS | ${estado}`);

      const { data: html } = await axios.get(url, { headers: HEADERS, timeout: 20000 });
      const $ = cheerio.load(html);

      let encontrados = 0;

      // Tentar JSON-LD primeiro (mais confiável)
      $('script[type="application/ld+json"]').each((i, el) => {
        try {
          const json = JSON.parse($(el).html() || '{}');
          const eventos = Array.isArray(json) ? json : [json];
          eventos.filter(e => e['@type'] === 'Event' && e.name).forEach(ev => {
            const dataEv = parseData(ev.startDate);
            if (dataEv && dataEv > new Date()) {
              salvar({
                nome: ev.name,
                data: dataEv,
                cidade: ev.location?.address?.addressLocality || '',
                estado: ev.location?.address?.addressRegion?.slice(-2) || estado,
                distancias: extrairDistancias(ev.name + ' ' + (ev.description || '')),
                urlInscricao: ev.url || url,
                plataforma: 'ticketsports',
                foto: Array.isArray(ev.image) ? ev.image[0] : ev.image || null,
              }).then(r => { if (r) { total++; encontrados++; } }).catch(() => {});
            }
          });
        } catch {}
      });

      // HTML scraping como fallback
      if (encontrados === 0) {
        // Ticket Sports usa vários padrões de card — tentar múltiplos seletores
        const seletores = [
          '.event-card', '.card-evento', '[class*="EventCard"]',
          '[class*="event-card"]', 'article', '.ts-card',
          '[data-testid*="event"]', '.product-card'
        ];

        for (const sel of seletores) {
          const cards = $(sel);
          if (cards.length === 0) continue;

          cards.each((i, el) => {
            const $el = $(el);
            const textoCompleto = $el.text().replace(/\s+/g, ' ').trim();

            // Precisa ter pelo menos "km" para ser corrida
            if (!textoCompleto.toLowerCase().includes('km') && !textoCompleto.toLowerCase().includes('corrida')) return;

            const link = $el.find('a[href*="/en/"]').first().attr('href') ||
                         $el.closest('a[href*="/en/"]').attr('href') ||
                         $el.find('a').first().attr('href') || '';

            if (!link) return;

            const urlEv = link.startsWith('http') ? link : `https://www.ticketsports.com.br${link}`;
            const nome = $el.find('h2,h3,h4,[class*="title"],[class*="name"]').first().text().trim() ||
                         $el.find('strong').first().text().trim();

            if (!nome || nome.length < 4) return;

            const dataTexto = $el.find('time,[class*="date"],[class*="data"]').first().text().trim();
            const localTexto = $el.find('[class*="city"],[class*="local"],[class*="location"]').first().text().trim();
            const img = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src') || '';
            const precoTexto = $el.find('[class*="price"],[class*="preco"]').first().text().trim();

            const dataEv = parseData(dataTexto);
            if (dataEv && dataEv < new Date()) return; // passada

            const partes = localTexto.split(/[-,\/]/).map(p => p.trim());
            const cidadeEv = partes[0] || '';
            const estadoEv = partes.find(p => ESTADOS.includes(p.toUpperCase()))?.toUpperCase() || estado;

            salvar({
              nome,
              data: dataEv || new Date(Date.now() + 45*86400000),
              cidade: cidadeEv,
              estado: estadoEv,
              distancias: extrairDistancias(nome + ' ' + textoCompleto),
              urlInscricao: urlEv,
              plataforma: 'ticketsports',
              foto: img.startsWith('http') ? img : null,
              precoMin: extrairPreco(precoTexto),
            }).then(r => { if (r) { total++; encontrados++; } }).catch(() => {});
          });

          if (encontrados > 0) break;
        }
      }

      addLog(`✅ TS ${estado}: ${encontrados} corridas`);
      await sleep(2500); // Respeitar o servidor

    } catch(e) {
      addLog(`⚠️ TS ${estado}: ${e.message}`);
      await sleep(1000);
    }
  }

  addLog(`🏁 Ticket Sports concluído: ${total} corridas`);
  return total;
}

// ─── SCRAPER: SYMPLA ──────────────────────────────────────────
async function scraperSympla() {
  addLog('🎯 Iniciando Sympla...');
  let total = 0;

  const termos = ['corrida+de+rua', 'meia+maratona', 'maratona', 'trail+run', 'corrida+5km', 'corrida+10km'];

  for (const termo of termos) {
    try {
      const url = `https://www.sympla.com.br/eventos/busca?s=${termo}&tipo=presencial&data=proximos`;
      addLog(`📄 Sympla | ${termo}`);

      const { data: html } = await axios.get(url, { headers: HEADERS, timeout: 20000 });
      const $ = cheerio.load(html);

      // Sympla tem JSON no script __NEXT_DATA__
      const nextData = $('script#__NEXT_DATA__').html();
      if (nextData) {
        try {
          const json = JSON.parse(nextData);
          const eventos = json?.props?.pageProps?.events ||
                         json?.props?.pageProps?.data?.events || [];

          eventos.forEach(ev => {
            const dataEv = parseData(ev.start_date || ev.startDate || ev.date);
            if (!dataEv || dataEv < new Date()) return;

            const estadoEv = ev.address?.state || ev.state || extrairEstado(ev.address?.city || '');
            if (!estadoEv) return;

            salvar({
              nome: ev.name || ev.title,
              data: dataEv,
              cidade: ev.address?.city || ev.city || '',
              estado: estadoEv,
              distancias: extrairDistancias(ev.name + ' ' + (ev.description || '')),
              urlInscricao: `https://www.sympla.com.br/evento/${ev.slug || ev.id}`,
              plataforma: 'sympla',
              foto: ev.image || ev.thumb || null,
              precoMin: ev.price?.min || null,
            }).then(r => { if (r) total++; }).catch(() => {});
          });
        } catch {}
      }

      // Fallback HTML
      $('[class*="EventCard"],[class*="event-card"],[data-event-id]').each((i, el) => {
        const $el = $(el);
        const nome = $el.find('[class*="title"],[class*="name"],h3,h4').first().text().trim();
        const link = $el.find('a').first().attr('href') || $el.closest('a').attr('href') || '';
        const dataTexto = $el.find('time,[class*="date"]').first().text().trim();
        const localTexto = $el.find('[class*="location"],[class*="local"]').first().text().trim();

        if (!nome || !link) return;
        const dataEv = parseData(dataTexto);
        if (dataEv && dataEv < new Date()) return;

        const url2 = link.startsWith('http') ? link : `https://www.sympla.com.br${link}`;
        const partes = localTexto.split(/[-,]/).map(p => p.trim());
        const estadoEv = partes.find(p => ESTADOS.includes(p.toUpperCase()))?.toUpperCase() || '';
        if (!estadoEv) return;

        salvar({
          nome, data: dataEv || new Date(Date.now() + 45*86400000),
          cidade: partes[0] || '', estado: estadoEv,
          distancias: extrairDistancias(nome),
          urlInscricao: url2, plataforma: 'sympla',
        }).then(r => { if (r) total++; }).catch(() => {});
      });

      await sleep(3000);
    } catch(e) {
      addLog(`⚠️ Sympla ${termo}: ${e.message}`);
    }
  }

  addLog(`🏁 Sympla concluído: ${total} corridas`);
  return total;
}

// ─── ENCERRAR PASSADAS ────────────────────────────────────────
async function encerrarPassadas() {
  try {
    const r = await prisma.corridaAberta.updateMany({
      where: { data: { lt: new Date() }, ativa: true },
      data: { ativa: false }
    });
    addLog(`📅 ${r.count} corridas passadas encerradas`);
  } catch(e) {
    addLog(`⚠️ Erro ao encerrar passadas: ${e.message}`);
  }
}

// ─── RUNNER PRINCIPAL ─────────────────────────────────────────
export async function runScraperCorridas(estadosFoco = null) {
  if (scraperStatus.rodando) {
    return { error: 'Scraper já está rodando' };
  }

  scraperStatus.rodando = true;
  scraperStatus.logs = [];
  scraperStatus.totalEncontrado = 0;

  const inicio = Date.now();
  addLog('🚀 PACE Race Finder iniciado!');

  try {
    const estados = estadosFoco || ESTADOS;
    const r1 = await scraperTicketSports(estados);
    await sleep(3000);
    const r2 = await scraperSympla();
    await encerrarPassadas();

    const total = await prisma.corridaAberta.count({ where: { ativa: true } });
    const tempo = ((Date.now() - inicio) / 1000).toFixed(1);

    scraperStatus.totalEncontrado = total;
    scraperStatus.ultimaExecucao = new Date();
    addLog(`🏁 Concluído em ${tempo}s | ${total} corridas ativas no banco`);

    return { success: true, ticketSports: r1, sympla: r2, totalAtivo: total, tempo };
  } catch(e) {
    addLog(`❌ Erro geral: ${e.message}`);
    return { error: e.message };
  } finally {
    scraperStatus.rodando = false;
    scraperStatus.progresso = { atual: 0, total: 0, fase: 'Concluído' };
  }
}
