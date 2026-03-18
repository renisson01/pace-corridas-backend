import { calcularScore, calcularIdadeBiologica } from '../../lib/bioage.js';
import prisma from '../../lib/prisma.js';
import jwt from 'jsonwebtoken';
const JWT = process.env.JWT_SECRET || 'pace-secret-2026';
function getUser(req) { try { return jwt.verify(req.headers.authorization?.replace('Bearer ', ''), JWT); } catch { return null; } }

export async function cobaiaRoutes(fastify) {
  fastify.post('/cobaia/checkin', async (req, reply) => {
    const u = getUser(req); if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { peso, gorduraPct, massaMagra, hrvMedia, fcRepouso, horasSono, qualidadeSono, horasDormir, horasAcordar, humor, energia, vyvanse, notas } = req.body || {};
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    try {
      const checkin = await prisma.cobaiaDiario.upsert({ where: { userId_data: { userId: u.userId, data: hoje } }, create: { userId: u.userId, data: hoje, peso, gorduraPct, massaMagra, hrvMedia, fcRepouso, horasSono, qualidadeSono, horasDormir, horasAcordar, humor, energia, vyvanse: vyvanse || false, notas }, update: { peso, gorduraPct, massaMagra, hrvMedia, fcRepouso, horasSono, qualidadeSono, horasDormir, horasAcordar, humor, energia, vyvanse: vyvanse || false, notas } });
      return { success: true, checkin };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });
  fastify.post('/cobaia/alimentacao', async (req, reply) => {
    const u = getUser(req); if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { refeicao, descricao, fotoUrl, caloriasEst, proteinaEst, carbEst, gorduraEst, horario } = req.body || {};
    if (!refeicao || !descricao) return reply.code(400).send({ error: 'Campos obrigatórios' });
    try { const reg = await prisma.cobaiaAlimentacao.create({ data: { userId: u.userId, data: new Date(), refeicao, descricao, fotoUrl, caloriasEst, proteinaEst, carbEst, gorduraEst, horario } }); return { success: true, registro: reg }; } catch(e) { return reply.code(500).send({ error: e.message }); }
  });
  fastify.post('/cobaia/sauna', async (req, reply) => {
    const u = getUser(req); if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { protocolo, duracaoMin, tempMedia, fcAntes, fcDepois, sensacao, notas } = req.body || {};
    if (!protocolo || !duracaoMin) return reply.code(400).send({ error: 'Campos obrigatórios' });
    try { const reg = await prisma.cobaiaSauna.create({ data: { userId: u.userId, data: new Date(), protocolo, duracaoMin, tempMedia, fcAntes, fcDepois, sensacao, notas } }); return { success: true, registro: reg }; } catch(e) { return reply.code(500).send({ error: e.message }); }
  });
  fastify.post('/cobaia/agenda', async (req, reply) => {
    const u = getUser(req); if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { tipo, titulo, descricao, horario, duracao, data } = req.body || {};
    if (!tipo || !titulo) return reply.code(400).send({ error: 'Campos obrigatórios' });
    try { const reg = await prisma.cobaiaAgenda.create({ data: { userId: u.userId, data: data ? new Date(data) : new Date(), tipo, titulo, descricao, horario, duracao } }); return { success: true, registro: reg }; } catch(e) { return reply.code(500).send({ error: e.message }); }
  });
  fastify.patch('/cobaia/agenda/:id', async (req, reply) => {
    const u = getUser(req); if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try { const reg = await prisma.cobaiaAgenda.update({ where: { id: req.params.id }, data: { completado: true, notas: req.body?.notas } }); return { success: true, registro: reg }; } catch(e) { return reply.code(500).send({ error: e.message }); }
  });
  fastify.post('/cobaia/exame', async (req, reply) => {
    const u = getUser(req); if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { tipoExame, marcador, valor, unidade, refMin, refMax, notas, data } = req.body || {};
    if (!marcador || valor === undefined) return reply.code(400).send({ error: 'Campos obrigatórios' });
    const status = refMin != null && refMax != null ? (valor >= refMin && valor <= refMax ? 'normal' : 'atencao') : null;
    try { const reg = await prisma.cobaiaExame.create({ data: { userId: u.userId, data: data ? new Date(data) : new Date(), tipoExame, marcador, valor, unidade, refMin, refMax, status, notas } }); return { success: true, registro: reg }; } catch(e) { return reply.code(500).send({ error: e.message }); }
  });
  fastify.get('/cobaia/dashboard/:userId?', async (req, reply) => {
    let userId = req.params.userId;
    if (!userId) { const u = getUser(req); if (!u) return reply.code(401).send({ error: 'Login necessário' }); userId = u.userId; }
    try {
      const [user, diarios, alimentacao, agenda, saunas, exames, treinos] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { name:true, city:true, state:true, age:true, tempo5k:true, tempo10k:true, tempo21k:true, nivelAtleta:true } }),
        prisma.cobaiaDiario.findMany({ where: { userId }, orderBy: { data: 'desc' }, take: 60 }),
        prisma.cobaiaAlimentacao.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
        prisma.cobaiaAgenda.findMany({ where: { userId }, orderBy: { data: 'desc' }, take: 30 }),
        prisma.cobaiaSauna.findMany({ where: { userId }, orderBy: { data: 'desc' }, take: 30 }),
        prisma.cobaiaExame.findMany({ where: { userId }, orderBy: { data: 'desc' }, take: 50 }),
        prisma.atividadeGPS.findMany({ where: { userId }, orderBy: { iniciadoEm: 'desc' }, take: 30, select: { distanciaKm:true, duracaoSeg:true, paceMedio:true, iniciadoEm:true, tipo:true, titulo:true, fonte:true, elevacaoGanho:true } }),
      ]);
      let streak = 0;
      const hoje = new Date(); hoje.setHours(0,0,0,0);
      for (let i = 0; i < diarios.length; i++) { const d = new Date(diarios[i].data); d.setHours(0,0,0,0); if (Math.round((hoje-d)/(24*60*60*1000)) === streak) streak++; else break; }
      const inicio = new Date('2026-03-15T03:00:00Z');
      const diaProtocolo = Math.floor((new Date() - inicio) / (24*60*60*1000)) + 1;
      const ultimo = diarios[0] || {};
      const scoreObj = calcularScore({ horasSono: ultimo.horasSono||0, hrvMedia: ultimo.hrvMedia||0, fcRepouso: ultimo.fcRepouso||60, gorduraPct: ultimo.gorduraPct||15, treinouHoje: treinos.some(t => { const d = new Date(t.iniciadoEm); d.setHours(0,0,0,0); return d.getTime()===hoje.getTime(); }), streak });
      const bioAge = calcularIdadeBiologica(user?.age || 31, scoreObj);
      return { bioAge, score: scoreObj.total, scoreFatores: scoreObj.fatores, scoreDetalhes: scoreObj.detalhes, atleta: user, diaProtocolo: Math.min(Math.max(diaProtocolo,1),60), streak, diarios: diarios.reverse(), alimentacaoHoje: alimentacao.filter(a => { const d=new Date(a.createdAt);d.setHours(0,0,0,0);const h=new Date();h.setHours(0,0,0,0);return d.getTime()===h.getTime(); }), agendaHoje: agenda.filter(a => { const d=new Date(a.data);d.setHours(0,0,0,0);const h=new Date();h.setHours(0,0,0,0);return d.getTime()===h.getTime(); }), saunas, exames, treinos, totais: { diasRegistrados: diarios.length, sessSauna: saunas.length, examesFeitos: exames.length, treinosFeitos: treinos.filter(t=>t.distanciaKm>0.5).length, kmTotal: treinos.reduce((s,t)=>s+(t.distanciaKm||0),0).toFixed(1) } };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });
  fastify.get('/cobaia/hoje', async (req, reply) => {
    const u = getUser(req); if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const amanha = new Date(hoje); amanha.setDate(amanha.getDate()+1);
    try {
      const [checkin, refeicoes, agenda, sauna] = await Promise.all([ prisma.cobaiaDiario.findFirst({ where: { userId: u.userId, data: hoje } }), prisma.cobaiaAlimentacao.findMany({ where: { userId: u.userId, createdAt: { gte: hoje, lt: amanha } } }), prisma.cobaiaAgenda.findMany({ where: { userId: u.userId, data: { gte: hoje, lt: amanha } } }), prisma.cobaiaSauna.findMany({ where: { userId: u.userId, data: { gte: hoje, lt: amanha } } }) ]);
      return { checkin, refeicoes, agenda, sauna, checkinFeito: !!checkin };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });
}
