import prisma from '../../lib/prisma.js';

function tempoParaSegundos(t) {
  if (!t) return 999999;
  const parts = t.split(':').map(Number);
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  if (parts.length === 2) return parts[0]*60 + parts[1];
  return 999999;
}

function calcVelocidade(tempo, distKm) {
  const secs = tempoParaSegundos(tempo);
  if (!secs || secs === 999999 || !distKm) return null;
  return parseFloat((distKm / (secs / 3600)).toFixed(2));
}

function nivelAtleta(pts) {
  if (pts >= 12000) return { label:'⭐ Elite Mundial',  cor:'yellow' };
  if (pts >= 7000)  return { label:'🔥 Elite Nacional', cor:'orange' };
  if (pts >= 3000)  return { label:'💪 Elite Regional', cor:'blue'   };
  if (pts >= 1000)  return { label:'📈 Sub-Elite',      cor:'green'  };
  return                   { label:'🌱 Avançado',       cor:'gray'   };
}

function extrairKm(distStr) {
  if (!distStr) return null;
  const m = distStr.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

export async function rankingRoutes(fastify) {

  // RANKING GERAL
  fastify.get('/ranking', async (req) => {
    const { genero, estado, limit = 100 } = req.query;
    const where = {};
    if (genero) where.gender = genero;
    if (estado) where.state = estado;
    const atletas = await prisma.athlete.findMany({
      where, orderBy: { totalPoints: 'desc' }, take: parseInt(limit),
      select: {
        id:true, name:true, equipe:true, state:true, gender:true,
        totalRaces:true, totalPoints:true, age:true,
        results: { orderBy: { points: 'desc' }, take: 1, include: { race: { select: { name:true } } } }
      }
    });
    return atletas.map((a, i) => ({
      posicao: i+1, id:a.id, name:a.name, equipe:a.equipe||null,
      state:a.state||null, gender:a.gender, totalRaces:a.totalRaces,
      totalPoints:a.totalPoints, nivel:nivelAtleta(a.totalPoints).label,
      melhorProva:a.results[0]?.race?.name||null
    }));
  });

  fastify.get('/ranking/42km', async (req) => { return await rankingPorDistancia('42', req.query.genero); });
  fastify.get('/ranking/21km', async (req) => { return await rankingPorDistancia('21', req.query.genero); });
  fastify.get('/ranking/15km', async (req) => { return await rankingPorDistancia('15', req.query.genero); });
  fastify.get('/ranking/10km', async (req) => { return await rankingPorDistancia('10', req.query.genero); });
  fastify.get('/ranking/5km',  async (req) => { return await rankingPorDistancia('5',  req.query.genero); });
  fastify.get('/ranking/3km',  async (req) => { return await rankingPorDistancia('3',  req.query.genero); });

  fastify.get('/ranking/stats', async () => {
    const [totalAtletas, totalResultados, totalCorridas] = await Promise.all([
      prisma.athlete.count(), prisma.result.count(), prisma.race.count()
    ]);
    return { totalAtletas, totalResultados, totalCorridas };
  });

  fastify.get('/buscar-atletas', async (req) => {
    const { nome, estado, limit = 20 } = req.query;
    const where = {};
    if (nome)   where.name  = { contains: nome, mode: 'insensitive' };
    if (estado) where.state = estado;
    const atletas = await prisma.athlete.findMany({
      where, take: parseInt(limit), orderBy: { totalPoints: 'desc' },
      select: { id:true, name:true, equipe:true, state:true, gender:true, totalPoints:true, totalRaces:true }
    });
    return atletas.map((a, i) => ({
      posicao: i+1, id:a.id, name:a.name, equipe:a.equipe||null,
      state:a.state||null, gender:a.gender, totalPoints:a.totalPoints,
      totalRaces:a.totalRaces, nivel:nivelAtleta(a.totalPoints).label
    }));
  });

  // PERFIL COMPLETO DO ATLETA
  fastify.get('/atleta/buscar-por-nome', async (req, reply) => {
    const { nome } = req.query;
    if (!nome || nome.length < 3) return reply.code(400).send({ error: 'Nome muito curto' });
    const atletas = await prisma.athlete.findMany({
      where: { name: { contains: nome, mode: 'insensitive' } },
      take: 5,
      select: {
        id:true, name:true, gender:true, state:true, equipe:true, totalRaces:true,
        results: { take: 1, orderBy: { createdAt: 'desc' }, include: { race: { select: { name:true, date:true } } } }
      }
    });
    return atletas.map(a => ({
      id: a.id, name: a.name, gender: a.gender, state: a.state,
      equipe: a.equipe, totalRaces: a.totalRaces,
      ultimaCorrida: a.results[0]?.race?.name || null,
      ultimaData: a.results[0]?.race?.date || null
    }));
  });

  fastify.get('/atleta/:id', async (req, reply) => {
    const { id } = req.params;
    const atleta = await prisma.athlete.findUnique({
      where: { id },
      include: {
        results: {
          orderBy: { createdAt: 'desc' },
          include: { race: { select: { id:true, name:true, date:true, city:true, distance:true } } }
        }
      }
    });
    if (!atleta) return reply.code(404).send({ error: 'Atleta não encontrado' });

    const provas = atleta.results.map(r => {
      const km = extrairKm(r.distance);
      const vel = calcVelocidade(r.time, km);
      return {
        raceId: r.raceId, raceName: r.race?.name||'—',
        raceDate: r.race?.date||null, raceCity: r.race?.city||null,
        distance: r.distance, time: r.time, pace: r.pace,
        velocidade: vel ? `${vel} km/h` : null,
        overallRank: r.overallRank, genderRank: r.genderRank,
        ageGroup: r.ageGroup, points: r.points
      };
    });

    const melhoresPorDist = {};
    for (const p of provas) {
      const d = p.distance;
      if (!d) continue;
      if (!melhoresPorDist[d] || tempoParaSegundos(p.time) < tempoParaSegundos(melhoresPorDist[d].time)) {
        melhoresPorDist[d] = p;
      }
    }

    return {
      id: atleta.id, name: atleta.name, gender: atleta.gender,
      age: atleta.age, state: atleta.state, city: atleta.city,
      equipe: atleta.equipe, totalRaces: atleta.totalRaces,
      totalPoints: atleta.totalPoints, nivel: nivelAtleta(atleta.totalPoints).label,
      photo: atleta.photo||null, provas, melhoresPorDist
    };
  });

  // RESULTADOS DE UMA CORRIDA
  fastify.get('/corrida/:raceId/resultados', async (req, reply) => {
    const { raceId } = req.params;
    const { genero, faixa, cidade, dist, limit = 50 } = req.query;
    const race = await prisma.race.findUnique({ where: { id: raceId } });
    if (!race) return reply.code(404).send({ error: 'Corrida não encontrada' });
    const where = { raceId };
    if (dist) where.distance = { contains: dist };
    if (faixa) where.ageGroup = faixa;
    const results = await prisma.result.findMany({
      where, orderBy: { overallRank: 'asc' },
      include: { athlete: { select: { id:true, name:true, gender:true, state:true, city:true, equipe:true, age:true, photo:true } } }
    });
    let lista = results;
    if (genero) lista = lista.filter(r => r.athlete?.gender === genero);
    if (cidade) lista = lista.filter(r =>
      r.athlete?.city?.toLowerCase().includes(cidade.toLowerCase()) ||
      r.athlete?.state?.toLowerCase().includes(cidade.toLowerCase())
    );
    lista = lista.slice(0, parseInt(limit));
    const km = extrairKm(lista[0]?.distance);
    return {
      race: { id: race.id, name: race.name, date: race.date, city: race.city },
      total: lista.length,
      resultados: lista.map((r, i) => ({
        pos: r.overallRank||i+1,
        atletaId: r.athleteId,
        nome: r.athlete?.name||'—',
        genero: r.athlete?.gender,
        idade: r.athlete?.age,
        cidade: r.athlete?.city,
        estado: r.athlete?.state,
        equipe: r.athlete?.equipe,
        photo: r.athlete?.photo||null,
        tempo: r.time, pace: r.pace,
        velocidade: calcVelocidade(r.time, km) ? `${calcVelocidade(r.time, km)} km/h` : null,
        faixaEtaria: r.ageGroup,
        rankFaixa: r.genderRank,
        points: r.points
      }))
    };
  });

  // FAIXAS ETÁRIAS
  fastify.get('/corrida/:raceId/faixas', async (req, reply) => {
    const { raceId } = req.params;
    const { dist } = req.query;
    const where = { raceId };
    if (dist) where.distance = { contains: dist };
    const faixas = await prisma.result.groupBy({
      by: ['ageGroup'], where, _count: { ageGroup: true }, orderBy: { ageGroup: 'asc' }
    });
    return faixas.filter(f => f.ageGroup).map(f => ({ faixa: f.ageGroup, total: f._count.ageGroup }));
  });

  // DISTÂNCIAS
  fastify.get('/corrida/:raceId/distancias', async (req, reply) => {
    const { raceId } = req.params;
    const dists = await prisma.result.groupBy({
      by: ['distance'], where: { raceId }, _count: { distance: true }
    });
    return dists.filter(d => d.distance)
      .map(d => ({ distance: d.distance, total: d._count.distance }))
      .sort((a, b) => (extrairKm(b.distance)||0) - (extrairKm(a.distance)||0));
  });

  // LISTA DE CORRIDAS
  fastify.get('/corridas', async () => {
    const races = await prisma.race.findMany({
      orderBy: { date: 'desc' },
      select: {
        id:true, name:true, date:true, city:true, state:true, distance:true,
        _count: { select: { results: true } }
      }
    });
    return races.map(r => ({
      id: r.id, name: r.name, date: r.date,
      city: r.city, state: r.state, distance: r.distance,
      totalResultados: r._count.results
    }));
  });

}

async function rankingPorDistancia(distKm, genero) {
  const where = {};
  if (genero) where.gender = genero;
  const atletas = await prisma.athlete.findMany({
    where,
    select: {
      id:true, name:true, equipe:true, state:true, gender:true, totalPoints:true,
      results: { where: { distance: { contains: distKm } }, select: { time:true, overallRank:true } }
    }
  });
  return atletas
    .filter(a => a.results.length > 0)
    .map(a => {
      const melhor = a.results.reduce((best, r) =>
        tempoParaSegundos(r.time) < tempoParaSegundos(best.time) ? r : best
      );
      return {
        id:a.id, name:a.name, equipe:a.equipe||null, state:a.state||null,
        gender:a.gender, totalPoints:a.totalPoints,
        nivel:nivelAtleta(a.totalPoints).label, melhorTempo:melhor.time
      };
    })
    .sort((a, b) => tempoParaSegundos(a.melhorTempo) - tempoParaSegundos(b.melhorTempo))
    .map((a, i) => ({ ...a, posicao: i+1 }));
}
