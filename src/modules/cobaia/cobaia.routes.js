import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

let prisma;
try { const mod = await import('../../index.js'); prisma = mod.default; } catch { prisma = new PrismaClient(); }
const JWT = process.env.JWT_SECRET || 'pace-secret-2026';

function getUser(req) {
  try { return jwt.verify(req.headers.authorization?.replace('Bearer ', ''), JWT); }
  catch { return null; }
}

export async function cobaiaRoutes(fastify) {

  // ==================== CHECK-IN DIÁRIO ====================
  fastify.post('/cobaia/checkin', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { peso, gorduraPct, massaMagra, hrvMedia, fcRepouso, horasSono, qualidadeSono,
            horasDormir, horasAcordar, humor, energia, vyvanse, notas } = req.body || {};
    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    try {
      const checkin = await prisma.cobaiaDiario.upsert({
        where: { userId_data: { userId: u.userId, data: hoje } },
        create: { userId: u.userId, data: hoje, peso, gorduraPct, massaMagra, hrvMedia, fcRepouso,
                  horasSono, qualidadeSono, horasDormir, horasAcordar, humor, energia, vyvanse: vyvanse || false, notas },
        update: { peso, gorduraPct, massaMagra, hrvMedia, fcRepouso, horasSono, qualidadeSono,
                  horasDormir, horasAcordar, humor, energia, vyvanse: vyvanse || false, notas }
      });
      return { success: true, checkin };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ==================== REGISTRAR ALIMENTAÇÃO ====================
  fastify.post('/cobaia/alimentacao', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { refeicao, descricao, fotoUrl, caloriasEst, proteinaEst, carbEst, gorduraEst, horario } = req.body || {};
    if (!refeicao || !descricao) return reply.code(400).send({ error: 'Refeição e descrição obrigatórios' });
    try {
      const reg = await prisma.cobaiaAlimentacao.create({
        data: { userId: u.userId, data: new Date(), refeicao, descricao, fotoUrl,
                caloriasEst, proteinaEst, carbEst, gorduraEst, horario }
      });
      return { success: true, registro: reg };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ==================== REGISTRAR SAUNA ====================
  fastify.post('/cobaia/sauna', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { protocolo, duracaoMin, tempMedia, fcAntes, fcDepois, sensacao, notas } = req.body || {};
    if (!protocolo || !duracaoMin) return reply.code(400).send({ error: 'Protocolo e duração obrigatórios' });
    try {
      const reg = await prisma.cobaiaSauna.create({
        data: { userId: u.userId, data: new Date(), protocolo, duracaoMin, tempMedia, fcAntes, fcDepois, sensacao, notas }
      });
      return { success: true, registro: reg };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ==================== REGISTRAR AGENDA ====================
  fastify.post('/cobaia/agenda', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { tipo, titulo, descricao, horario, duracao, data } = req.body || {};
    if (!tipo || !titulo) return reply.code(400).send({ error: 'Tipo e título obrigatórios' });
    try {
      const reg = await prisma.cobaiaAgenda.create({
        data: { userId: u.userId, data: data ? new Date(data) : new Date(), tipo, titulo, descricao, horario, duracao }
      });
      return { success: true, registro: reg };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ==================== COMPLETAR ITEM DA AGENDA ====================
  fastify.patch('/cobaia/agenda/:id', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const reg = await prisma.cobaiaAgenda.update({
        where: { id: req.params.id },
        data: { completado: true, notas: req.body?.notas }
      });
      return { success: true, registro: reg };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ==================== REGISTRAR EXAME ====================
  fastify.post('/cobaia/exame', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { tipoExame, marcador, valor, unidade, refMin, refMax, notas, data } = req.body || {};
    if (!marcador || valor === undefined) return reply.code(400).send({ error: 'Marcador e valor obrigatórios' });
    const status = refMin && refMax ? (valor >= refMin && valor <= refMax ? 'normal' : (valor < refMin ? 'atencao' : 'atencao')) : null;
    try {
      const reg = await prisma.cobaiaExame.create({
        data: { userId: u.userId, data: data ? new Date(data) : new Date(), tipoExame, marcador, valor, unidade, refMin, refMax, status, notas }
      });
      return { success: true, registro: reg };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ==================== DASHBOARD DADOS (PÚBLICO) ====================
  fastify.get('/cobaia/dashboard/:userId?', async (req, reply) => {
    // Se tem userId no param, é público. Senão, usa o logado.
    let userId = req.params.userId;
    if (!userId) {
      const u = getUser(req);
      if (!u) return reply.code(401).send({ error: 'Login necessário' });
      userId = u.userId;
    }

    try {
      const [user, diarios, alimentacao, agenda, saunas, exames, treinos] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { name: true, city: true, state: true, tempo5k: true, tempo10k: true, tempo21k: true, nivelAtleta: true } }),
        prisma.cobaiaDiario.findMany({ where: { userId }, orderBy: { data: 'desc' }, take: 60 }),
        prisma.cobaiaAlimentacao.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
        prisma.cobaiaAgenda.findMany({ where: { userId }, orderBy: { data: 'desc' }, take: 30 }),
        prisma.cobaiaSauna.findMany({ where: { userId }, orderBy: { data: 'desc' }, take: 30 }),
        prisma.cobaiaExame.findMany({ where: { userId }, orderBy: { data: 'desc' }, take: 50 }),
        prisma.atividadeGPS.findMany({ where: { userId }, orderBy: { iniciadoEm: 'desc' }, take: 30,
          select: { distanciaKm: true, duracaoSeg: true, paceMedio: true, iniciadoEm: true, tipo: true } }),
      ]);

      // Calcular streak (dias consecutivos com check-in)
      let streak = 0;
      const hoje = new Date(); hoje.setHours(0,0,0,0);
      for (let i = 0; i < diarios.length; i++) {
        const d = new Date(diarios[i].data); d.setHours(0,0,0,0);
        const diff = Math.round((hoje - d) / (24*60*60*1000));
        if (diff === streak) streak++;
        else break;
      }

      // Calcular dia do protocolo (inicio: 15/03/2026)
      const inicio = new Date('2026-03-15');
      const diaProtocolo = Math.floor((new Date() - inicio) / (24*60*60*1000)) + 1;

      return {
        atleta: user,
        diaProtocolo: Math.min(Math.max(diaProtocolo, 1), 60),
        streak,
        diarios: diarios.reverse(),
        alimentacaoHoje: alimentacao.filter(a => {
          const d = new Date(a.createdAt); d.setHours(0,0,0,0);
          const h = new Date(); h.setHours(0,0,0,0);
          return d.getTime() === h.getTime();
        }),
        agendaHoje: agenda.filter(a => {
          const d = new Date(a.data); d.setHours(0,0,0,0);
          const h = new Date(); h.setHours(0,0,0,0);
          return d.getTime() === h.getTime();
        }),
        saunas,
        exames,
        treinos,
        totais: {
          diasRegistrados: diarios.length,
          sessSauna: saunas.length,
          examesFeitos: exames.length,
          treinosFeitos: treinos.length,
          kmTotal: treinos.reduce((s, t) => s + (t.distanciaKm || 0), 0).toFixed(1)
        }
      };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // ==================== MEU RESUMO HOJE ====================
  fastify.get('/cobaia/hoje', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);
    try {
      const [checkin, refeicoes, agenda, sauna] = await Promise.all([
        prisma.cobaiaDiario.findFirst({ where: { userId: u.userId, data: hoje } }),
        prisma.cobaiaAlimentacao.findMany({ where: { userId: u.userId, createdAt: { gte: hoje, lt: amanha } } }),
        prisma.cobaiaAgenda.findMany({ where: { userId: u.userId, data: { gte: hoje, lt: amanha } } }),
        prisma.cobaiaSauna.findMany({ where: { userId: u.userId, data: { gte: hoje, lt: amanha } } }),
      ]);
      return { checkin, refeicoes, agenda, sauna, checkinFeito: !!checkin };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });
}
