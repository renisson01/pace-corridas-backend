import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const ADMIN_KEY = process.env.ADMIN_KEY || 'pace-admin-2026';

const ELITE = [
  { nome:'Justino Pedro da Silva',           equipe:'APA Petrolina/PE', genero:'M', rs:[
    {prova:'Campeonato Pan-Americano Maratona Caracas 2023', dist:'42km', tempo:'2:16:15', pos:1},
    {prova:'Maratona Internacional Rio de Janeiro 2022',     dist:'42km', tempo:'2:14:30', pos:1},
    {prova:'Maratona Internacional Rio de Janeiro 2021',     dist:'42km', tempo:'2:15:10', pos:1},
    {prova:'Maratona Internacional João Pessoa 2023',        dist:'42km', tempo:'2:19:24', pos:1},
    {prova:'Maratona Salvador 2025',                         dist:'42km', tempo:'2:22:29', pos:1},
    {prova:'New Balance 15K São Paulo 2024',                 dist:'15km', tempo:'0:46:59', pos:1},
    {prova:'Maratona de Curitiba 2025',                      dist:'42km', tempo:'2:17:35', pos:2},
    {prova:'SP City Marathon 2025',                          dist:'42km', tempo:'2:23:22', pos:2},
  ]},
  { nome:'Edson Amaro Arruda dos Santos',    equipe:'APA Petrolina/PE', genero:'M', rs:[
    {prova:'Maratona Internacional de São Paulo 2017',    dist:'42km', tempo:'2:21:40', pos:2},
    {prova:'Maratona Internacional Rio de Janeiro 2022',  dist:'42km', tempo:'2:16:10', pos:2},
    {prova:'Maratona Internacional Rio de Janeiro 2021',  dist:'42km', tempo:'2:16:45', pos:2},
    {prova:'Maratona Internacional João Pessoa 2023',     dist:'42km', tempo:'2:23:58', pos:2},
    {prova:'Maratona de Curitiba 2023',                   dist:'42km', tempo:'2:22:33', pos:4},
    {prova:'New Balance 15K São Paulo 2024',              dist:'15km', tempo:'0:49:33', pos:3},
  ]},
  { nome:'Éderson Vilela Pereira',           equipe:'EC Pinheiros/SP',  genero:'M', rs:[
    {prova:'SP City Marathon 2025',       dist:'42km', tempo:'2:15:58', pos:1},
    {prova:'Maratona de Curitiba 2025',   dist:'42km', tempo:'2:15:13', pos:1},
    {prova:'Maratona de Curitiba 2024',   dist:'42km', tempo:'2:16:40', pos:1},
  ]},
  { nome:'Daniel do Nascimento',             equipe:'Independente/CE',  genero:'M', rs:[
    {prova:'Maratona Internacional de São Paulo 2024', dist:'42km', tempo:'2:08:55', pos:1},
    {prova:'Maratona Internacional de São Paulo 2023', dist:'42km', tempo:'2:09:01', pos:1},
  ]},
  { nome:'Jailton Henrique dos Santos',      equipe:'Independente',     genero:'M', rs:[
    {prova:'Corrida Internacional São Silvestre 2024', dist:'15km', tempo:'0:43:12', pos:1},
    {prova:'Corrida Internacional São Silvestre 2023', dist:'15km', tempo:'0:43:45', pos:2},
  ]},
  { nome:'Franck Caldeira de Almeida',       equipe:'Independente/SP',  genero:'M', rs:[
    {prova:'Corrida Internacional São Silvestre 2006', dist:'15km', tempo:'0:44:55', pos:1},
    {prova:'Maratona Internacional de São Paulo 2017', dist:'42km', tempo:'2:21:53', pos:3},
    {prova:'Volta Internacional da Pampulha 2023',     dist:'18km', tempo:'0:55:10', pos:1},
    {prova:'Volta Internacional da Pampulha 2022',     dist:'18km', tempo:'0:54:45', pos:1},
  ]},
  { nome:'Fábio Jesus Correia',              equipe:'Kiatleta/SP',      genero:'M', rs:[
    {prova:'Corrida Internacional São Silvestre 2022',     dist:'15km', tempo:'0:44:50', pos:4},
    {prova:'Meia Maratona Internacional Rio 2023',         dist:'21km', tempo:'1:03:22', pos:2},
    {prova:'Volta Internacional da Pampulha 2024',         dist:'18km', tempo:'0:54:30', pos:1},
  ]},
  { nome:'Marílson Gomes dos Santos',        equipe:'Independente/SP',  genero:'M', rs:[
    {prova:'Corrida Internacional São Silvestre 2010', dist:'15km', tempo:'0:44:31', pos:1},
    {prova:'Corrida Internacional São Silvestre 2005', dist:'15km', tempo:'0:45:02', pos:1},
    {prova:'Corrida Internacional São Silvestre 2003', dist:'15km', tempo:'0:45:18', pos:1},
  ]},
  { nome:'José Márcio Leão da Silva',        equipe:'APA Petrolina/PE', genero:'M', rs:[
    {prova:'Maratona Salvador 2022',               dist:'42km', tempo:'2:24:51', pos:2},
    {prova:'Meia Maratona Internacional Rio 2023', dist:'21km', tempo:'1:04:10', pos:3},
  ]},
  { nome:'Joílson Bernardo da Silva',        equipe:'APA Petrolina/PE', genero:'M', rs:[
    {prova:'Campeonato Pan-Americano Maratona Caracas 2023', dist:'42km', tempo:'2:18:15', pos:2},
    {prova:'Maratona Internacional Rio de Janeiro 2023',     dist:'42km', tempo:'2:17:45', pos:3},
  ]},
  { nome:'Wellington Bezerra da Silva',      equipe:'Independente',     genero:'M', rs:[
    {prova:'Maratona Internacional de São Paulo 2017',   dist:'42km', tempo:'2:22:37', pos:4},
    {prova:'Maratona Internacional Rio de Janeiro 2022', dist:'42km', tempo:'2:18:30', pos:4},
  ]},
  { nome:'Rafael Silvestre Luanderson Santos', equipe:'APA Petrolina/PE', genero:'M', rs:[
    {prova:'Maratona Salvador 2022',     dist:'42km', tempo:'2:26:10', pos:1},
    {prova:'Maratona de Curitiba 2024',  dist:'42km', tempo:'2:21:05', pos:3},
  ]},
  { nome:'Geilson dos Santos da Conceição', equipe:'Independente/BA',  genero:'M', rs:[
    {prova:'Maratona Salvador 2022', dist:'42km', tempo:'2:22:05', pos:1},
  ]},
  { nome:'Thiago dos Santos Costa',          equipe:'APA Petrolina/PE', genero:'M', rs:[
    {prova:'Maratona Salvador 2025', dist:'42km', tempo:'2:23:54', pos:3},
    {prova:'Maratona Salvador 2023', dist:'42km', tempo:'2:25:30', pos:3},
  ]},
  { nome:'Wendell Jerônimo de Souza',        equipe:'ACORR/MT',         genero:'M', rs:[
    {prova:'Corrida Internacional São Silvestre 2024', dist:'15km', tempo:'0:44:20', pos:5},
  ]},
  { nome:'Ronaldo da Costa',                 equipe:'Independente/MG',  genero:'M', rs:[
    {prova:'Maratona de Berlim 1998',                  dist:'42km', tempo:'2:06:05', pos:1},
    {prova:'Corrida Internacional São Silvestre 1994', dist:'15km', tempo:'0:45:55', pos:1},
  ]},
  { nome:'Mirela Saturnino de Andrade',      equipe:'APA Petrolina/PE', genero:'F', rs:[
    {prova:'Campeonato Pan-Americano Maratona Caracas 2023', dist:'42km', tempo:'2:42:17', pos:3},
    {prova:'Maratona Internacional Rio de Janeiro 2021',     dist:'42km', tempo:'2:38:45', pos:1},
    {prova:'Campeonato Sul-Americano Maratona 2022',         dist:'42km', tempo:'2:40:10', pos:1},
    {prova:'Campeonato Sul-Americano Maratona 2017',         dist:'42km', tempo:'2:44:20', pos:1},
    {prova:'New Balance 15K São Paulo 2024',                 dist:'15km', tempo:'0:56:14', pos:1},
    {prova:'SP City Marathon 2025',                          dist:'42km', tempo:'2:50:22', pos:2},
  ]},
  { nome:'Amanda Aparecida de Oliveira',     equipe:'Elite Runners/RJ', genero:'F', rs:[
    {prova:'SP City Marathon 2025',                      dist:'42km', tempo:'2:40:56', pos:1},
    {prova:'Maratona Internacional Rio de Janeiro 2024', dist:'42km', tempo:'2:43:10', pos:1},
  ]},
  { nome:'Lucélia Peres',                    equipe:'Independente/SP',  genero:'F', rs:[
    {prova:'Corrida Internacional São Silvestre 2006', dist:'15km', tempo:'0:51:20', pos:1},
    {prova:'Maratona Internacional de São Paulo 2010', dist:'42km', tempo:'2:34:18', pos:1},
    {prova:'Maratona Internacional de São Paulo 2009', dist:'42km', tempo:'2:35:44', pos:1},
  ]},
  { nome:'Marily dos Santos',                equipe:'Independente/AL',  genero:'F', rs:[
    {prova:'Maratona Salvador 2023', dist:'42km', tempo:'2:51:55', pos:1},
    {prova:'Maratona Salvador 2022', dist:'42km', tempo:'2:53:10', pos:1},
  ]},
  { nome:'Anastácia Rocha',                  equipe:'APA Petrolina/PE', genero:'F', rs:[
    {prova:'Meia Maratona de Porto Alegre 2024', dist:'21km', tempo:'1:16:30', pos:2},
  ]},
  { nome:'Nubia de Oliveira Silva',          equipe:'Independente',     genero:'F', rs:[
    {prova:'Corrida Internacional São Silvestre 2024',    dist:'15km', tempo:'0:51:45', pos:3},
    {prova:'Meia Maratona Internacional Rio 2024',        dist:'21km', tempo:'1:14:20', pos:2},
  ]},
  { nome:'Valdilene dos Santos Silva',       equipe:'Independente',     genero:'F', rs:[
    {prova:'Corrida Internacional São Silvestre 2024',  dist:'15km', tempo:'0:52:10', pos:4},
    {prova:'Maratona Internacional de São Paulo 2024',  dist:'42km', tempo:'2:45:30', pos:3},
  ]},
  { nome:'Adriana Teodosio Gonçalves',       equipe:'Independente/BA',  genero:'F', rs:[
    {prova:'Maratona Salvador 2022', dist:'42km', tempo:'3:02:15', pos:2},
  ]},
];

function pts(pos, dist) {
  const base = dist.includes('42') ? 5000 : dist.includes('21') ? 3000 : 2000;
  return Math.max(50, base - (pos - 1) * 300);
}

export async function adminRoutes(fastify) {

  // SEED - limpa fictícios e insere reais
  fastify.post('/admin/seed-elite', async (req, reply) => {
    const key = req.headers['x-admin-key'] || req.body?.key;
    if (key !== ADMIN_KEY) return reply.code(403).send({ error: 'Não autorizado' });

    try {
      // Deletar só atletas sem userId (fictícios)
      const fictícios = await prisma.athlete.findMany({ where: { user: null }, select: { id: true } });
      const ids = fictícios.map(a => a.id);
      if (ids.length) {
        await prisma.result.deleteMany({ where: { athleteId: { in: ids } } });
        await prisma.athlete.deleteMany({ where: { id: { in: ids } } });
      }

      let criados = 0, resultados = 0;
      const log = [];

      for (const a of ELITE) {
        let atleta = await prisma.athlete.findFirst({
          where: { name: { equals: a.nome, mode: 'insensitive' } }
        });
        if (!atleta) {
          atleta = await prisma.athlete.create({
            data: { name: a.nome, equipe: a.equipe, gender: a.genero, totalRaces: 0, totalPoints: 0 }
          });
          criados++;
        }

        for (const r of a.rs) {
          let corrida = await prisma.race.findFirst({
            where: { name: { contains: r.prova.substring(0, 25), mode: 'insensitive' } }
          });
          if (!corrida) {
            const ano = r.prova.match(/\d{4}/)?.[0] || '2024';
            corrida = await prisma.race.create({
              data: { name: r.prova, city: 'Brasil', state: 'BR', date: new Date(`${ano}-06-01`), distances: r.dist, organizer: 'Oficial', status: 'completed' }
            });
          }
          const existe = await prisma.result.findUnique({
            where: { athleteId_raceId: { athleteId: atleta.id, raceId: corrida.id } }
          });
          if (existe) continue;
          await prisma.result.create({
            data: { athleteId: atleta.id, raceId: corrida.id, time: r.tempo, overallRank: r.pos, distance: r.dist, points: pts(r.pos, r.dist) }
          });
          resultados++;
        }

        const all = await prisma.result.findMany({ where: { athleteId: atleta.id } });
        await prisma.athlete.update({
          where: { id: atleta.id },
          data: { totalRaces: all.length, totalPoints: all.reduce((s, x) => s + x.points, 0) }
        });
        log.push(`${a.nome} (${a.equipe})`);
      }

      return { ok: true, removidos: ids.length, criados, resultados, atletas: log };
    } catch(e) {
      console.error('[SEED]', e);
      return reply.code(500).send({ error: e.message });
    }
  });

  // STATS
  fastify.get('/admin/stats', async (req, reply) => {
    const key = req.headers['x-admin-key'];
    if (key !== ADMIN_KEY) return reply.code(403).send({ error: 'Não autorizado' });
    const [athletes, results, races, users] = await Promise.all([
      prisma.athlete.count(), prisma.result.count(), prisma.race.count(), prisma.user.count()
    ]);
    const top5 = await prisma.athlete.findMany({
      orderBy: { totalPoints: 'desc' }, take: 5,
      select: { name: true, equipe: true, totalPoints: true }
    });
    return { athletes, results, races, users, top5 };
  });
}
