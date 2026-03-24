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

  // POST /cobaia/roda-vida — salvar avaliação
  fastify.post("/cobaia/roda-vida", async (req, reply) => {
    const u = getUser(req); if (!u) return reply.code(401).send({ error: "Login necessário" });
    const b = req.body || {};
    const roda = await prisma.rodaVida.create({
      data: { userId: u.userId, carreira: b.carreira||5, financas: b.financas||5, saude: b.saude||5, familia: b.familia||5, amorRomance: b.amorRomance||5, vidaSocial: b.vidaSocial||5, crescimentoPessoal: b.crescimentoPessoal||5, recreacao: b.recreacao||5, ambienteFisico: b.ambienteFisico||5, contribuicao: b.contribuicao||5, espiritualidade: b.espiritualidade||5, saudeMental: b.saudeMental||5, observacoes: b.observacoes || null }
    });
    return { success: true, roda };
  });

  // GET /cobaia/roda-vida — histórico
  fastify.get("/cobaia/roda-vida", async (req, reply) => {
    const u = getUser(req); if (!u) return reply.code(401).send({ error: "Login necessário" });
    const rodas = await prisma.rodaVida.findMany({ where: { userId: u.userId }, orderBy: { data: "desc" }, take: 12 });
    return { rodas };
  });
}

  fastify.get("/coach/daily", async (req, reply) => {
    const u = getUser(req); if (!u) return reply.code(401).send({ error: "Login necessario" });
    try {
      const userId = u.userId;
      const hora = new Date().getHours();
      const hoje = new Date(); hoje.setHours(0,0,0,0);
      const amanha = new Date(hoje); amanha.setDate(amanha.getDate()+1);
      const [user, ultimoCheckin, treinos7d, agenda, proximaCorrida] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { name:true, age:true, isPremium:true } }),
        prisma.cobaiaDiario.findFirst({ where: { userId }, orderBy: { data: "desc" } }),
        prisma.atividadeGPS.findMany({ where: { userId, iniciadoEm: { gte: new Date(Date.now()-7*24*60*60*1000) } }, take: 10 }),
        prisma.cobaiaAgenda.findMany({ where: { userId, data: { gte: hoje, lt: amanha } }, orderBy: { horario: "asc" } }),
        prisma.corridaAberta.findFirst({ where: { data: { gte: hoje }, ativa: true }, orderBy: { data: "asc" } })
      ]);
      const nome = (user?.name || "Atleta").split(" ")[0];
      const saudacao = hora < 6 ? "Boa madrugada" : hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
      const kmSemana = treinos7d.reduce((s,t) => s+(t.distanciaKm||0), 0).toFixed(1);
      const treinosSemana = treinos7d.length;
      const diasSemCheckin = ultimoCheckin ? Math.floor((Date.now()-new Date(ultimoCheckin.data).getTime())/(24*60*60*1000)) : 999;
      const cards = [];
      cards.push({type:"greeting",icon:hora<12?"\u2600":"\u{1F319}",title:saudacao+", "+nome+"!",message:treinosSemana>0?"Semana: "+kmSemana+"km em "+treinosSemana+" treinos.":"Sem treino essa semana.",color:"#F7931A"});
      if(diasSemCheckin>=1) cards.push({type:"action",icon:"\u{1F4CA}",title:"Check-in diario",message:diasSemCheckin===999?"Primeiro check-in!":"Faz "+diasSemCheckin+" dia(s).",action:"checkin",color:"#E74C3C"});
      else cards.push({type:"status",icon:"\u2705",title:"Check-in feito!",message:"Sono: "+(ultimoCheckin?.horasSono||"--")+"h",color:"#27AE60"});
      const treinoHoje = treinos7d.find(t => { const d=new Date(t.iniciadoEm);d.setHours(0,0,0,0);return d.getTime()===hoje.getTime(); });
      if(treinoHoje) cards.push({type:"done",icon:"\u{1F3C3}",title:"Treino: "+treinoHoje.distanciaKm.toFixed(1)+"km",message:"Pace: "+(treinoHoje.paceMedio||"--"),color:"#27AE60"});
      else if(hora>=5&&hora<=21) cards.push({type:"suggestion",icon:"\u{1F3C3}",title:"Treino de hoje",message:treinosSemana>=4?"Descanso ativo.":"Corrida Z2 30min.",action:"treino",color:"#F7931A"});
      if(proximaCorrida){const dp=Math.floor((new Date(proximaCorrida.data)-Date.now())/(24*60*60*1000));if(dp<=30) cards.push({type:"event",icon:"\u{1F3C1}",title:proximaCorrida.nome||"Corrida",message:dp===0?"HOJE!":"Em "+dp+" dia(s)",color:"#6366f1"});}
      if(agenda.length>0) cards.push({type:"agenda",icon:"\u{1F4C5}",title:"Agenda ("+agenda.length+")",items:agenda.map(a=>({titulo:a.titulo,horario:a.horario||"",completado:a.completado})),color:"#06b6d4"});
      return {cards,timestamp:new Date().toISOString(),nome,isPremium:user?.isPremium};
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });
