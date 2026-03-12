/**
 * PACE — Scraper de Corridas Abertas v2
 * Fonte principal: beta.ticketsports.com.br (SSR confirmado!)
 * Fonte secundária: sympla.com.br
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaClient } from '@prisma/client';

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

const ESTADOS = ['SP','RJ','MG','RS','PR','SC','CE','BA','PE','GO','DF','SE','AL','MA','PA','AM','MT','MS','RN','PB','PI','ES','RO','TO','AC','AP','RR'];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

// ─── UTILS ─────────────────────────────────────────────────────
function parseData(texto) {
  if (!texto) return null;
  texto = texto.trim();
  const m1 = texto.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (m1) {
    const ano = m1[3] || new Date().getFullYear();
    const d = new Date(`${ano}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}T12:00:00Z`);
    if (!isNaN(d)) return d;
  }
  const meses = {jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
  const m2 = texto.match(/(\d{1,2})\s+(?:de\s+)?(\w{3})\w*\s+(?:de\s+)?(\d{4})/i);
  if (m2) {
    const mes = meses[m2[2].toLowerCase().slice(0,3)];
    if (mes) {
      const d = new Date(`${m2[3]}-${String(mes).padStart(2,'0')}-${m2[1].padStart(2,'0')}T12:00:00Z`);
      if (!isNaN(d)) return d;
    }
  }
  return null;
}

function extrairDistancias(texto) {
  if (!texto) return '';
  const re = /(\d+(?:[.,]\d+)?)\s*km/gi;
  const matches = [];
  let m;
  while ((m = re.exec(texto)) !== null) {
    const km = parseFloat(m[1].replace(',','.'));
    if (km >= 1 && km <= 200) matches.push(`${km}km`);
  }
  return [...new Set(matches)].sort((a,b) => parseFloat(a)-parseFloat(b)).join(', ');
}

async function salvar(dados) {
  const { nome, data, cidade, estado, distancias, urlInscricao, plataforma, foto, precoMin, organizador } = dados;
  if (!nome || nome.length < 4 || !estado || !urlInscricao) return null;
  if (data && data < new Date()) return null;

  try {
    const existing = await prisma.corridaAberta.findFirst({
      where: {
        nome: { contains: nome.slice(0,20), mode: 'insensitive' },
        estado: estado.toUpperCase()
      }
    });
    if (existing) {
      return await prisma.corridaAberta.update({
        where: { id: existing.id },
        data: { linkInscricao: urlInscricao, imageUrl: foto || existing.imageUrl, preco: precoMin || existing.preco }
      });
    }
    return await prisma.corridaAberta.create({
      data: {
        nome: nome.slice(0, 200),
        data: data || new Date(Date.now() + 60*86400000),
        cidade: cidade || '',
        estado: estado.toUpperCase().slice(0,2),
        distancias: distancias || '',
        linkInscricao: urlInscricao,
        fonte: plataforma || 'scraper',
        imageUrl: foto || null,
        preco: precoMin || null,
        organizador: organizador || null,
        ativa: true,
      }
    });
  } catch(e) {
    addLog(`Erro salvar "${nome}": ${e.message.slice(0,80)}`);
    return null;
  }
}

// ─── TICKET SPORTS ─────────────────────────────────────────────
// URL confirmada: beta.ticketsports.com.br/Calendario renderiza SSR
export async function scraperTicketSports() {
  addLog('Iniciando Ticket Sports (beta SSR)...');
  let total = 0;

  const urls = [
    'https://beta.ticketsports.com.br/Calendario',
  ];

  for (const url of urls) {
    try {
      addLog(`Buscando: ${url}`);
      scraperStatus.progresso = { atual: 1, total: 1, fase: 'Ticket Sports' };

      const { data: html } = await axios.get(url, { headers: HEADERS, timeout: 25000 });
      const $ = cheerio.load(html);
      let encontrados = 0;

      $('a[href^="/e/"]').each((i, el) => {
        const $el = $(el);
        const link = $el.attr('href') || '';
        if (!link || link.length < 4) return;

        const urlEv = `https://beta.ticketsports.com.br${link.split('?')[0]}`;

        // Estrutura confirmada: child[2]=nome, child[4]=data, child[5]=local
        const filhos = $el.children('div');
        const nome   = filhos.eq(2).text().trim().replace('...','').trim();
        const dataTxt= filhos.eq(4).text().trim();
        const local  = filhos.eq(5).text().trim();
        const img    = $el.find('img').first().attr('src') || '';

        if (!nome || nome.length < 4) return;

        const partes  = local.split(',').map(p => p.trim());
        const cidadeEv = partes[0] || '';
        const estadoEv = (partes[1] || '').slice(0,2).toUpperCase();

        if (!estadoEv || !ESTADOS.includes(estadoEv)) return;

        const dataEv = parseData(dataTxt);

        salvar({
          nome, data: dataEv,
          cidade: cidadeEv, estado: estadoEv,
          distancias: extrairDistancias(nome),
          urlInscricao: urlEv,
          plataforma: 'ticketsports',
          foto: img.startsWith('https') ? img : null,
        }).then(r => { if (r) { total++; encontrados++; } }).catch(() => {});
      });

      addLog(`TS pagina: ${encontrados} corridas encontradas`);
      await sleep(3000);

    } catch(e) {
      addLog(`TS erro: ${e.message}`);
    }
  }

  addLog(`Ticket Sports concluido: ${total} corridas`);
  return total;
}

// ─── SYMPLA ────────────────────────────────────────────────────
export async function scraperSympla() {
  addLog('Iniciando Sympla...');
  let total = 0;

  const termos = ['corrida+de+rua', 'meia+maratona', 'maratona', 'trail+run'];

  for (const termo of termos) {
    try {
      const url = `https://www.sympla.com.br/eventos/busca?s=${termo}&tipo=presencial&data=proximos`;
      addLog(`Sympla | ${termo}`);

      const { data: html } = await axios.get(url, { headers: HEADERS, timeout: 20000 });
      const $ = cheerio.load(html);

      const nextDataScript = $('script#__NEXT_DATA__').html();
      if (nextDataScript) {
        try {
          const json = JSON.parse(nextDataScript);
          const eventos =
            json?.props?.pageProps?.events ||
            json?.props?.pageProps?.data?.events ||
            json?.props?.pageProps?.initialData?.events || [];

          for (const ev of eventos) {
            const dataEv = ev.start_date ? new Date(ev.start_date) : null;
            const estadoEv = ev.address?.state || '';
            if (!estadoEv || !dataEv || dataEv < new Date()) continue;

            const saved = await salvar({
              nome: ev.name || ev.title,
              data: dataEv,
              cidade: ev.address?.city || '',
              estado: estadoEv,
              distancias: extrairDistancias((ev.name || '') + ' ' + (ev.description || '')),
              urlInscricao: `https://www.sympla.com.br/evento/${ev.slug || ev.id}`,
              plataforma: 'sympla',
              foto: ev.image || null,
              precoMin: ev.price_min || null,
            }).catch(() => null);
            if (saved) total++;
          }
        } catch {}
      }

      await sleep(3000);
    } catch(e) {
      addLog(`Sympla ${termo}: ${e.message}`);
    }
  }

  addLog(`Sympla concluido: ${total} corridas`);
  return total;
}

// ─── ENCERRAR PASSADAS ─────────────────────────────────────────
async function encerrarPassadas() {
  try {
    const r = await prisma.corridaAberta.updateMany({
      where: { data: { lt: new Date() }, ativa: true },
      data: { ativa: false }
    });
    addLog(`${r.count} corridas passadas encerradas`);
  } catch {}
}

// ─── RUNNER PRINCIPAL ──────────────────────────────────────────
export async function runScraperCorridas() {
  if (scraperStatus.rodando) return { error: 'Scraper ja rodando' };

  scraperStatus.rodando = true;
  scraperStatus.logs = [];
  const inicio = Date.now();
  addLog('PACE Race Finder v2 iniciado!');

  try {
    const r1 = await scraperTicketSports();
    await sleep(2000);
    const r2 = await scraperSympla();
    await encerrarPassadas();

    const total = await prisma.corridaAberta.count({
      where: { ativa: true, data: { gte: new Date() } }
    });
    const tempo = ((Date.now() - inicio) / 1000).toFixed(1);
    scraperStatus.totalEncontrado = total;
    scraperStatus.ultimaExecucao = new Date();
    addLog(`Concluido em ${tempo}s | ${total} corridas ativas`);
    return { success: true, ticketSports: r1, sympla: r2, totalAtivo: total, tempo };
  } catch(e) {
    addLog(`Erro geral: ${e.message}`);
    return { error: e.message };
  } finally {
    scraperStatus.rodando = false;
    scraperStatus.progresso = { atual: 0, total: 0, fase: 'Concluido' };
  }
}
