/**
 * PACE — Rotas de Corridas Abertas + Race Finder
 */

import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { runScraperCorridas, scraperStatus } from '../scraper/race-finder.service.js';
import cron from 'node-cron';

const prisma = new PrismaClient();

function getUser(req) {
  try {
    const h = req.headers.authorization;
    if (!h) return null;
    return jwt.verify(h.replace('Bearer ', ''), process.env.JWT_SECRET || 'describe-oxygen-acoustic-pace2026');
  } catch { return null; }
}

// Agendar scraper automático: toda manhã às 6h e toda tarde às 18h
cron.schedule('0 6,18 * * *', () => {
  console.log('[PACE-Cron] Iniciando scraping automático de corridas...');
  runScraperCorridas().catch(console.error);
}, { timezone: 'America/Sao_Paulo' });

export async function corridasAbertasRoutes(fastify) {

  // ─── LISTAR CORRIDAS ─────────────────────────────────────
  fastify.get('/corridas-abertas', async (req) => {
    const { estado, distancia, mes, ano, tipo, busca, page = 1, limit = 30, orderBy = 'data' } = req.query;

    const where = { ativa: true, data: { gte: new Date() } };
    if (estado) where.estado = estado.toUpperCase();
    if (distancia) where.distancias = { contains: distancia, mode: 'insensitive' };
    if (busca) where.OR = [
      { nome: { contains: busca, mode: 'insensitive' } },
      { cidade: { contains: busca, mode: 'insensitive' } },
      { distancias: { contains: busca, mode: 'insensitive' } },
    ];
    if (mes || ano) {
      const anoNum = parseInt(ano) || new Date().getFullYear();
      const mesNum = parseInt(mes);
      if (mesNum) {
        where.data = {
          gte: new Date(anoNum, mesNum - 1, 1),
          lt: new Date(anoNum, mesNum, 1)
        };
      } else {
        where.data = { gte: new Date(anoNum, 0, 1), lt: new Date(anoNum + 1, 0, 1) };
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [corridas, total] = await Promise.all([
      prisma.corridaAberta.findMany({
        where,
        orderBy: orderBy === 'preco' ? { preco: 'asc' } : { data: 'asc' },
        skip, take: parseInt(limit),
      }),
      prisma.corridaAberta.count({ where })
    ]);

    return { corridas, total, paginas: Math.ceil(total / parseInt(limit)), pagina: parseInt(page) };
  });

  // ─── DETALHE ──────────────────────────────────────────────
  fastify.get('/corridas-abertas/:id', async (req, reply) => {
    const corrida = await prisma.corridaAberta.findUnique({ where: { id: req.params.id } });
    if (!corrida) return reply.code(404).send({ error: 'Corrida não encontrada' });

    // Incrementar visualizações (silencioso)
    prisma.corridaAberta.update({ where: { id: req.params.id }, data: {} }).catch(() => {});

    return corrida;
  });

  // ─── ESTADOS COM CORRIDAS ─────────────────────────────────
  fastify.get('/corridas-abertas/stats/estados', async () => {
    const stats = await prisma.corridaAberta.groupBy({
      by: ['estado'],
      where: { ativa: true, data: { gte: new Date() } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } }
    });
    return { estados: stats.map(s => ({ estado: s.estado, total: s._count.id })) };
  });

  // ─── PRÓXIMAS (para home do atleta) ──────────────────────
  fastify.get('/corridas-abertas/proximas/:estado', async (req) => {
    const corridas = await prisma.corridaAberta.findMany({
      where: { estado: req.params.estado.toUpperCase(), ativa: true, data: { gte: new Date() } },
      orderBy: { data: 'asc' },
      take: 5
    });
    return { corridas };
  });

  // ─── FAVORITAR ────────────────────────────────────────────
  fastify.post('/corridas-abertas/:id/favoritar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const existing = await prisma.favoritoCorrida.findFirst({
        where: { userId: u.userId, corridaId: req.params.id }
      });
      if (existing) {
        await prisma.favoritoCorrida.delete({ where: { id: existing.id } });
        return { favoritado: false };
      }
      await prisma.favoritoCorrida.create({ data: { userId: u.userId, corridaId: req.params.id } });
      return { favoritado: true };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ─── MEUS FAVORITOS ───────────────────────────────────────
  fastify.get('/corridas-abertas/meus/favoritos', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const favs = await prisma.favoritoCorrida.findMany({
      where: { userId: u.userId },
      include: { corrida: true },
      orderBy: { createdAt: 'desc' }
    });
    return { corridas: favs.map(f => f.corrida).filter(Boolean) };
  });

  // ─── ADMIN: ADICIONAR MANUAL ──────────────────────────────
  fastify.post('/corridas-abertas', async (req, reply) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) return reply.code(403).send({ error: 'Acesso negado' });

    const { nome, data, cidade, estado, distancias, linkInscricao, fonte, preco, organizador, imageUrl, descricao } = req.body || {};
    if (!nome || !data || !estado || !linkInscricao) return reply.code(400).send({ error: 'Campos: nome, data, estado, linkInscricao' });

    const corrida = await prisma.corridaAberta.create({
      data: { nome, data: new Date(data), cidade: cidade||'', estado: estado.toUpperCase(), distancias: distancias||'', linkInscricao, fonte: fonte||'manual', preco: preco ? parseFloat(preco) : null, organizador, imageUrl, descricao }
    });
    return { success: true, corrida };
  });

  // ─── ADMIN: EDITAR ────────────────────────────────────────
  fastify.patch('/corridas-abertas/:id', async (req, reply) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) return reply.code(403).send({ error: 'Acesso negado' });
    const corrida = await prisma.corridaAberta.update({ where: { id: req.params.id }, data: req.body });
    return { success: true, corrida };
  });

  // ─── ADMIN: DELETAR UMA ───────────────────────────────────
  fastify.delete('/corridas-abertas/:id', async (req, reply) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) return reply.code(403).send({ error: 'Acesso negado' });
    await prisma.corridaAberta.delete({ where: { id: req.params.id } });
    return { success: true };
  });

  // ─── ADMIN: LIMPAR TODAS ──────────────────────────────────
  fastify.delete('/corridas-abertas/limpar-todas', async (req, reply) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) return reply.code(403).send({ error: 'Acesso negado' });
    const deletados = await prisma.corridaAberta.deleteMany({});
    return { success: true, deletados: deletados.count };
  });

  // ─── SCRAPER: STATUS ──────────────────────────────────────
  fastify.get('/corridas-abertas/scraper/status', async (req, reply) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) return reply.code(403).send({ error: 'Acesso negado' });
    const totalAtivo = await prisma.corridaAberta.count({ where: { ativa: true, data: { gte: new Date() } } });
    return { ...scraperStatus, totalAtivo };
  });

  // ─── SCRAPER: RODAR AGORA ─────────────────────────────────
  fastify.post('/corridas-abertas/scraper/rodar', async (req, reply) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) return reply.code(403).send({ error: 'Acesso negado' });
    if (scraperStatus.rodando) return { error: 'Scraper já está rodando', status: scraperStatus };

    const { estados } = req.body || {};
    // Roda em background
    runScraperCorridas(estados || null).catch(console.error);
    return { success: true, msg: 'Scraper iniciado em background!', acompanhe: 'GET /corridas-abertas/scraper/status' };
  });

  // ─── SCRAPER: LOGS ────────────────────────────────────────
  fastify.get('/corridas-abertas/scraper/logs', async (req, reply) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) return reply.code(403).send({ error: 'Acesso negado' });
    return { logs: scraperStatus.logs, rodando: scraperStatus.rodando };
  });

  // ─── ADMIN: ENRIQUECER IMAGENS ────────────────────────────
  fastify.post('/corridas-abertas/enrich/imagens', async (req, reply) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) return reply.code(403).send({ error: 'Acesso negado' });

    const PLACEHOLDER = 'https://cdn.ticketsports.com.br/ticketagora/site/evento-ticket-agora-2x.png';
    const corridas = await prisma.corridaAberta.findMany({
      where: { OR: [{ imageUrl: null }, { imageUrl: PLACEHOLDER }] },
      select: { id: true, nome: true, linkInscricao: true }
    });

    // Roda em background
    (async () => {
      const axios = (await import('axios')).default;
      const cheerio = await import('cheerio');
      let ok = 0;
      for (const c of corridas) {
        try {
          const { data: html } = await axios.get(c.linkInscricao, {
            headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36' },
            timeout: 12000
          });
          const $ = cheerio.load(html);
          const img = $('meta[property="og:image"]').attr('content') ||
                      $('meta[name="twitter:image"]').attr('content') || '';
          if (img && img !== PLACEHOLDER && img.startsWith('http')) {
            await prisma.corridaAberta.update({ where: { id: c.id }, data: { imageUrl: img } });
            ok++;
            console.log(`[Enrich] ✅ ${c.nome.slice(0,30)} → imagem atualizada`);
          }
          await new Promise(r => setTimeout(r, 1500));
        } catch(e) { console.log(`[Enrich] ❌ ${c.nome.slice(0,25)}: ${e.message.slice(0,40)}`); }
      }
      console.log(`[Enrich] 🏁 ${ok}/${corridas.length} imagens atualizadas`);
    })();

    return { success: true, total: corridas.length, msg: `Enriquecendo ${corridas.length} corridas em background` };
  });
}
