import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
const prisma = new PrismaClient();
const JWT = process.env.JWT_SECRET || 'pace-2026';

function getUser(req) {
  try { return jwt.verify(req.headers.authorization?.replace('Bearer ',''), JWT); }
  catch { return null; }
}

export async function verifyRoutes(fastify) {

  // Verificar resultado via URL
  fastify.post('/results/verify', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { url, nomeNoResultado } = req.body;
    if (!url) return reply.code(400).send({ error: 'URL obrigatória' });
    const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { name: true } });
    const nome = nomeNoResultado || user?.name || 'Atleta';
    
    // Tentar buscar página
    try {
      const fetch = (...a) => import('node-fetch').then(({default:f})=>f(...a));
      const r = await (await fetch)(url, { headers: {'User-Agent':'Mozilla/5.0'}, timeout: 8000 });
      const html = await r.text();
      const nomeNorm = nome.toLowerCase().split(' ')[0];
      
      // Buscar nome na página
      const linhas = html.split('\n').filter(l => l.toLowerCase().includes(nomeNorm));
      const tempoMatch = html.match(/\b(\d{1,2}:\d{2}:\d{2})\b/);
      const tempo = tempoMatch ? tempoMatch[0] : null;
      
      // Extrair título da prova
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const tituloProva = titleMatch ? titleMatch[1].replace(/\s*[|\-–]\s*.*/,'').trim() : url.split('/').slice(-1)[0].replace(/-/g,' ');
      
      if (linhas.length > 0 || tempo) {
        return {
          success: true,
          tituloProva: tituloProva.substring(0,80),
          distancia: url.includes('42') ? '42km' : url.includes('21') ? '21km' : url.includes('10') ? '10km' : '5km',
          resultados: [{ nome, tempo: tempo || '00:00:00', posicao: null }],
          url
        };
      }
      return { success: false, message: `"${nome}" não encontrado na página`, sugestao: 'Verifique se o link é da página de resultados e se seu nome está correto.' };
    } catch(e) {
      return { success: false, message: 'Erro ao acessar o link: ' + e.message, sugestao: 'Verifique se o link está correto.' };
    }
  });

  // Confirmar e salvar resultado
  fastify.post('/results/confirm', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { url, tituloProva, distancia, tempo, posicao, pace, estado, cidade } = req.body;
    if (!tempo || !tituloProva) return reply.code(400).send({ error: 'Tempo e prova obrigatórios' });

    try {
      // Buscar ou criar corrida
      let corrida = await prisma.race.findFirst({
        where: { name: { contains: tituloProva.split(' ').slice(0,3).join(' '), mode: 'insensitive' } }
      });
      if (!corrida) {
        corrida = await prisma.race.create({
          data: { name: tituloProva, city: cidade||'Brasil', state: estado||'BR', date: new Date(), distances: distancia||'A definir', organizer: 'Verificado pelo atleta', status: 'completed', registrationUrl: url||null }
        });
      }

      // Buscar ou criar atleta
      const user = await prisma.user.findUnique({ where: { id: u.userId }, include: { athlete: true } });
      let atleta = user.athlete;
      if (!atleta) {
        atleta = await prisma.athlete.create({ data: { name: user.name, city: user.city||null, state: user.state||null, gender: user.gender||null, age: user.age||null, totalRaces: 0, totalPoints: 0 } });
        await prisma.user.update({ where: { id: u.userId }, data: { athleteId: atleta.id } });
      }

      // Verificar duplicata
      const jaExiste = await prisma.result.findUnique({ where: { athleteId_raceId: { athleteId: atleta.id, raceId: corrida.id } } });
      if (jaExiste) return { success: false, message: 'Você já cadastrou este resultado.' };

      // Salvar resultado
      const pontos = Math.max(100, 1000 - ((parseInt(posicao)||100) - 1) * 10);
      await prisma.result.create({ data: { athleteId: atleta.id, raceId: corrida.id, time: tempo, pace: pace||null, overallRank: parseInt(posicao)||null, distance: distancia||null, points: pontos } });

      // Atualizar totais
      const allR = await prisma.result.findMany({ where: { athleteId: atleta.id } });
      await prisma.athlete.update({ where: { id: atleta.id }, data: { totalRaces: allR.length, totalPoints: allR.reduce((s,r)=>s+r.points,0) } });

      // Medalhas
      const medals = await prisma.medal.findMany({ where: { userId: u.userId } });
      const tipos = medals.map(m=>m.type);
      if (allR.length >= 1 && !tipos.includes('first_race')) await prisma.medal.create({ data: { userId: u.userId, type:'first_race', title:'Primeira Corrida!', desc:'Resultado verificado', icon:'🏃' } });
      if (allR.length >= 5 && !tipos.includes('races_5')) await prisma.medal.create({ data: { userId: u.userId, type:'races_5', title:'Corredor', desc:'5 corridas', icon:'⚡' } });
      if (allR.length >= 10 && !tipos.includes('races_10')) await prisma.medal.create({ data: { userId: u.userId, type:'races_10', title:'Maratonista', desc:'10 corridas', icon:'🔥' } });

      return { success: true, message: 'Resultado confirmado!', pontos };
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });

  // Meu histórico
  fastify.get('/my/results', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const user = await prisma.user.findUnique({ where: { id: u.userId }, include: { athlete: { include: { results: { include: { race: true }, orderBy: { createdAt: 'desc' } } } } } });
    return user?.athlete?.results || [];
  });
}
