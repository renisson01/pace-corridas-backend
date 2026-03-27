import prisma from '../../lib/prisma.js';
/**
 * REGENI — Rotas do Scraper de Corridas
 * 
 * Endpoints:
 * POST /scraper/executar        — Roda todos os scrapers Tier 1
 * POST /scraper/executar/:fonte — Roda scraper específico
 * GET  /scraper/fontes          — Lista todas as fontes disponíveis
 * GET  /scraper/stats           — Estatísticas do banco de corridas
 */

import jwt from 'jsonwebtoken';
import { executarScraping, SCRAPERS } from './scraper.service.js';

const JWT = process.env.JWT_SECRET || 'pace-secret-2026';

function getUser(req) {
  try { return jwt.verify(req.headers.authorization?.replace('Bearer ', ''), JWT); }
  catch { return null; }
}

export async function scraperRoutes(fastify) {

  // Executar todos os scrapers Tier 1
  fastify.post('/scraper/executar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    // Verificar se é admin
    const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { isAdmin: true } });
    // admin check temporariamente desabilitado

    const { tier, fontes } = req.body || {};

    // Executa em background e retorna imediatamente
    const relatorio = await executarScraping(fontes || null, tier || 1);
    return relatorio;
  });

  // Executar scraper específico
  fastify.post('/scraper/executar/:fonte', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { isAdmin: true } });
    // admin check temporariamente desabilitado

    const { fonte } = req.params;
    if (!SCRAPERS[fonte]) {
      return reply.code(404).send({ error: `Fonte "${fonte}" não encontrada`, disponiveis: Object.keys(SCRAPERS) });
    }

    const relatorio = await executarScraping([fonte], null);
    return relatorio;
  });

  // Listar fontes disponíveis
  fastify.get('/scraper/fontes', async (req, reply) => {
    const lista = Object.entries(SCRAPERS).map(([key, s]) => ({
      key,
      tier: s.tier,
      descricao: s.descricao,
      status: s.tier === 1 ? 'ativo' : 'precisa_puppeteer',
    }));

    return {
      total: lista.length,
      tier1_ativas: lista.filter(f => f.tier === 1).length,
      tier2_pendentes: lista.filter(f => f.tier === 2).length,
      fontes: lista,
    };
  });

  // Estatísticas do banco de corridas
  fastify.get('/scraper/stats', async (req, reply) => {
    const [total, futuras, porFonte, porEstado] = await Promise.all([
      prisma.corridaAberta.count(),
      prisma.corridaAberta.count({ where: { data: { gte: new Date() }, ativa: true } }),
      prisma.corridaAberta.groupBy({ by: ['fonte'], _count: true, orderBy: { _count: { fonte: 'desc' } } }).catch(() => []),
      prisma.corridaAberta.groupBy({ by: ['estado'], _count: true, where: { ativa: true }, orderBy: { _count: { estado: 'desc' } } }).catch(() => []),
    ]);

    return {
      totalCorridas: total,
      corridasFuturas: futuras,
      meta: 1000,
      progresso: `${Math.round(futuras / 10)}%`,
      porFonte: porFonte.map(f => ({ fonte: f.fonte || 'manual', corridas: f._count })),
      porEstado: porEstado.map(e => ({ estado: e.estado || '?', corridas: e._count })),
    };
  });
}
