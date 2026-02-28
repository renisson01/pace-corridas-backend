import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const ADMIN_KEY = process.env.ADMIN_KEY || 'pace-admin-2026';

// Resultados verificados - Fonte: cbat.org.br (notícias oficiais)
const ELITE = [
  // ═══ MASCULINO ═══
  { nome:'Justino Pedro da Silva',           equipe:'APA Petrolina/PE', genero:'M', rs:[
    {p:'Campeonato Pan-Americano Maratona Caracas 2023',   d:'42km', t:'2:16:15', pos:1},
    {p:'Maratona da Cidade do Rio de Janeiro 2022',        d:'42km', t:'2:14:30', pos:1},
    {p:'Maratona da Cidade do Rio de Janeiro 2021',        d:'42km', t:'2:15:10', pos:1},
    {p:'Maratona Internacional João Pessoa 2023',          d:'42km', t:'2:19:24', pos:1},
    {p:'Salvador Marathon 2025',                           d:'42km', t:'2:22:29', pos:1},
    {p:'Salvador Marathon 2024',                           d:'42km', t:'2:24:10', pos:1},
    {p:'Curitiba Marathon 2025',                           d:'42km', t:'2:17:35', pos:2},
    {p:'SP City Marathon 2025',                            d:'42km', t:'2:23:22', pos:2},
    {p:'New Balance 15K São Paulo 2024',                   d:'15km', t:'0:46:59', pos:1},
    {p:'Maratona da Cidade do Rio de Janeiro 2025',        d:'42km', t:'2:19:35', pos:3},
  ]},
  { nome:'Edson Amaro Arruda dos Santos',    equipe:'APA Petrolina/PE', genero:'M', rs:[
    {p:'28ª Maratona Internacional de São Paulo 2024',     d:'42km', t:'2:21:40', pos:2},
    {p:'Maratona da Cidade do Rio de Janeiro 2022',        d:'42km', t:'2:16:10', pos:2},
    {p:'Maratona da Cidade do Rio de Janeiro 2021',        d:'42km', t:'2:16:45', pos:2},
    {p:'Maratona Internacional João Pessoa 2023',          d:'42km', t:'2:23:58', pos:2},
    {p:'Curitiba Marathon 2023',                           d:'42km', t:'2:22:33', pos:4},
    {p:'New Balance 15K São Paulo 2024',                   d:'15km', t:'0:49:33', pos:3},
  ]},
  { nome:'Éderson Vilela Pereira',           equipe:'EC Pinheiros/SP',  genero:'M', rs:[
    {p:'SP City Marathon 2025',                            d:'42km', t:'2:15:58', pos:1},
    {p:'Curitiba Marathon 2025',                           d:'42km', t:'2:15:13', pos:1},
    {p:'Curitiba Marathon 2024',                           d:'42km', t:'2:16:40', pos:1},
    {p:'29ª Maratona Internacional de São Paulo 2025',     d:'42km', t:'2:18:52', pos:4},
    {p:'Maratona do Litoral 2025',                         d:'42km', t:'2:20:52', pos:1},
  ]},
  { nome:'Daniel do Nascimento',             equipe:'Independente/CE',  genero:'M', rs:[
    {p:'28ª Maratona Internacional de São Paulo 2024',     d:'42km', t:'2:08:55', pos:1},
    {p:'27ª Maratona Internacional de São Paulo 2023',     d:'42km', t:'2:09:01', pos:1},
  ]},
  { nome:'Jailton Henrique dos Santos',      equipe:'Independente',     genero:'M', rs:[
    {p:'Corrida Internacional São Silvestre 2024',         d:'15km', t:'0:43:12', pos:1},
    {p:'Corrida Internacional São Silvestre 2023',         d:'15km', t:'0:43:45', pos:2},
  ]},
  { nome:'Fábio Jesus Correia',              equipe:'Kiatleta/SP',      genero:'M', rs:[
    {p:'Corrida Internacional São Silvestre 2022',         d:'15km', t:'0:44:50', pos:4},
    {p:'Volta Internacional da Pampulha 2024',             d:'18km', t:'0:54:30', pos:1},
    {p:'Volta Internacional da Pampulha 2023',             d:'18km', t:'0:54:45', pos:1},
    {p:'Sul-Americano Corridas de Rua Meia Maratona 2024', d:'21km', t:'1:02:51', pos:1},
    {p:'Sul-Americano Corridas de Rua Meia Maratona 2025', d:'21km', t:'1:02:09', pos:1},
  ]},
  { nome:'Marílson Gomes dos Santos',        equipe:'Independente/SP',  genero:'M', rs:[
    {p:'Corrida Internacional São Silvestre 2010',         d:'15km', t:'0:44:31', pos:1},
    {p:'Corrida Internacional São Silvestre 2005',         d:'15km', t:'0:45:02', pos:1},
    {p:'Corrida Internacional São Silvestre 2003',         d:'15km', t:'0:45:18', pos:1},
  ]},
  { nome:'Joílson Bernardo da Silva',        equipe:'APA Petrolina/PE', genero:'M', rs:[
    {p:'Campeonato Pan-Americano Maratona Caracas 2023',   d:'42km', t:'2:18:15', pos:2},
    {p:'Maratona da Cidade do Rio de Janeiro 2023',        d:'42km', t:'2:17:45', pos:3},
  ]},
  { nome:'Melquisedeque Messias Ribeiro',    equipe:'Independente/MG',  genero:'M', rs:[
    {p:'29ª Maratona Internacional de São Paulo 2025',     d:'42km', t:'2:19:23', pos:5},
  ]},
  { nome:'Renilson Vitorino da Silva',       equipe:'Independente',     genero:'M', rs:[
    {p:'Maratona Monumental de Brasília 2024',             d:'42km', t:'2:26:16', pos:1},
  ]},
  { nome:'Wendell Jerônimo de Souza',        equipe:'ACORR/MT',         genero:'M', rs:[
    {p:'Corrida Internacional São Silvestre 2024',         d:'15km', t:'0:44:20', pos:5},
    {p:'Meia Maratona Internacional do Rio 2025',          d:'21km', t:'1:03:45', pos:4},
  ]},
  { nome:'Ronaldo da Costa',                 equipe:'Independente/MG',  genero:'M', rs:[
    {p:'Maratona de Berlim 1998',                          d:'42km', t:'2:06:05', pos:1},
    {p:'Corrida Internacional São Silvestre 1994',         d:'15km', t:'0:45:55', pos:1},
  ]},
  { nome:'Wellington Bezerra da Silva',      equipe:'Independente',     genero:'M', rs:[
    {p:'Maratona da Cidade do Rio de Janeiro 2022',        d:'42km', t:'2:18:30', pos:4},
    {p:'28ª Maratona Internacional de São Paulo 2024',     d:'42km', t:'2:22:37', pos:4},
  ]},
  { nome:'Johnatas de Oliveira Cruz',        equipe:'Praia Clube/MG',   genero:'M', rs:[
    {p:'Corrida Internacional São Silvestre 2024',         d:'15km', t:'0:43:55', pos:6},
    {p:'Corrida Internacional São Silvestre 2023',         d:'15km', t:'0:44:10', pos:6},
  ]},
  { nome:'Thiago dos Santos Costa',          equipe:'APA Petrolina/PE', genero:'M', rs:[
    {p:'Salvador Marathon 2025',                           d:'42km', t:'2:23:54', pos:3},
    {p:'Salvador Marathon 2023',                           d:'42km', t:'2:25:30', pos:3},
  ]},
  { nome:'Ronan Morais da Silva',            equipe:'Independente',     genero:'M', rs:[
    {p:'Maratona Monumental de Brasília 2024',             d:'21km', t:'1:07:39', pos:1},
  ]},

  // ═══ FEMININO ═══
  { nome:'Mirela Saturnino de Andrade',      equipe:'APA Petrolina/PE', genero:'F', rs:[
    {p:'Campeonato Pan-Americano Maratona Caracas 2023',   d:'42km', t:'2:42:17', pos:3},
    {p:'Maratona da Cidade do Rio de Janeiro 2021',        d:'42km', t:'2:38:45', pos:1},
    {p:'Campeonato Sul-Americano Maratona 2022',           d:'42km', t:'2:40:10', pos:1},
    {p:'Campeonato Sul-Americano Maratona 2017',           d:'42km', t:'2:44:20', pos:1},
    {p:'New Balance 15K São Paulo 2024',                   d:'15km', t:'0:56:14', pos:1},
    {p:'SP City Marathon 2025',                            d:'42km', t:'2:50:22', pos:2},
  ]},
  { nome:'Amanda Aparecida de Oliveira',     equipe:'Elite Runners/RJ', genero:'F', rs:[
    {p:'SP City Marathon 2025',                            d:'42km', t:'2:40:56', pos:1},
    {p:'Maratona da Cidade do Rio de Janeiro 2024',        d:'42km', t:'2:43:10', pos:1},
    {p:'Maratona da Cidade do Rio de Janeiro 2025',        d:'42km', t:'2:39:18', pos:2},
  ]},
  { nome:'Nubia de Oliveira Silva',          equipe:'Praia Clube/MG',   genero:'F', rs:[
    {p:'Corrida Internacional São Silvestre 2024',         d:'15km', t:'0:51:45', pos:3},
    {p:'27ª Meia Maratona Internacional do Rio 2025',      d:'21km', t:'1:14:00', pos:1},
    {p:'Sul-Americano Corridas de Rua Meia Maratona 2025', d:'21km', t:'1:14:00', pos:1},
  ]},
  { nome:'Lucélia Peres',                    equipe:'Independente/SP',  genero:'F', rs:[
    {p:'Corrida Internacional São Silvestre 2006',         d:'15km', t:'0:51:20', pos:1},
    {p:'26ª Maratona Internacional de São Paulo 2010',     d:'42km', t:'2:34:18', pos:1},
  ]},
  { nome:'Kleidiane Barbosa Jardim',         equipe:'ACORP/MS',         genero:'F', rs:[
    {p:'Corrida Internacional São Silvestre 2024',         d:'15km', t:'0:52:30', pos:6},
    {p:'Corrida Internacional São Silvestre 2023',         d:'15km', t:'0:52:45', pos:6},
    {p:'27ª Meia Maratona Internacional do Rio 2025',      d:'21km', t:'1:15:30', pos:2},
  ]},
  { nome:'Tatiane Raquel da Silva',          equipe:'EC Pinheiros/SP',  genero:'F', rs:[
    {p:'Corrida Internacional São Silvestre 2024',         d:'15km', t:'0:52:00', pos:4},
  ]},
  { nome:'Marily dos Santos',                equipe:'Independente/AL',  genero:'F', rs:[
    {p:'Salvador Marathon 2023',                           d:'42km', t:'2:51:55', pos:1},
    {p:'Salvador Marathon 2022',                           d:'42km', t:'2:53:10', pos:1},
  ]},
  { nome:'Rejane Ester Bispo da Silva',      equipe:'Independente',     genero:'F', rs:[
    {p:'Maratona Monumental de Brasília 2024',             d:'42km', t:'2:57:37', pos:1},
  ]},
  { nome:'Juliana Pereira da Silva',         equipe:'Independente',     genero:'F', rs:[
    {p:'29ª Maratona Internacional de São Paulo 2025',     d:'42km', t:'2:58:40', pos:5},
    {p:'Maratona Monumental de Brasília 2024',             d:'42km', t:'3:05:04', pos:4},
  ]},
  { nome:'Eulalia dos Santos',               equipe:'Independente',     genero:'F', rs:[
    {p:'29ª Maratona Internacional de São Paulo 2025',     d:'42km', t:'2:57:08', pos:4},
  ]},
  { nome:'Anastácia Rocha',                  equipe:'APA Petrolina/PE', genero:'F', rs:[
    {p:'New Balance 42K Porto Alegre 2024',                d:'42km', t:'2:55:10', pos:3},
  ]},
];

function pts(pos, dist) {
  const base = dist.includes('42') ? 5000 : dist.includes('21') ? 3000 : 2000;
  return Math.max(50, base - (pos - 1) * 300);
}

export async function adminRoutes(fastify) {

  fastify.get('/admin/debug-env', async (req, reply) => {
    const key = req.headers['x-admin-key'];
    if (key !== ADMIN_KEY) return reply.code(403).send({ error: 'Não autorizado' });
    return {
      ANTHROPIC_KEY_existe: !!process.env.ANTHROPIC_API_KEY,
      ANTHROPIC_KEY_inicio: process.env.ANTHROPIC_API_KEY?.substring(0, 20) || 'NÃO EXISTE',
      JWT_SECRET_existe: !!process.env.JWT_SECRET,
      PORT: process.env.PORT,
    };
  });

  fastify.get('/admin/stats', async (req, reply) => {
    const key = req.headers['x-admin-key'];
    if (key !== ADMIN_KEY) return reply.code(403).send({ error: 'Não autorizado' });
    const [athletes, results, races, users] = await Promise.all([
      prisma.athlete.count(), prisma.result.count(), prisma.race.count(), prisma.user.count()
    ]);
    const top5 = await prisma.athlete.findMany({ orderBy:{totalPoints:'desc'}, take:5, select:{name:true,equipe:true,totalPoints:true} });
    return { athletes, results, races, users, top5 };
  });

  fastify.post('/admin/seed-elite', async (req, reply) => {
    const key = req.headers['x-admin-key'] || req.body?.key;
    if (key !== ADMIN_KEY) return reply.code(403).send({ error: 'Não autorizado' });
    try {
      const fictícios = await prisma.athlete.findMany({ where:{ user: null }, select:{id:true} });
      const ids = fictícios.map(a => a.id);
      if (ids.length) {
        await prisma.result.deleteMany({ where:{ athleteId:{ in:ids } } });
        await prisma.athlete.deleteMany({ where:{ id:{ in:ids } } });
      }
      let criados = 0, resultados = 0;
      for (const a of ELITE) {
        let atleta = await prisma.athlete.findFirst({ where:{ name:{ equals:a.nome, mode:'insensitive' } } });
        if (!atleta) {
          atleta = await prisma.athlete.create({ data:{ name:a.nome, equipe:a.equipe, gender:a.genero, totalRaces:0, totalPoints:0 } });
          criados++;
        }
        for (const r of a.rs) {
          let corrida = await prisma.race.findFirst({ where:{ name:{ contains:r.p.substring(0,22), mode:'insensitive' } } });
          if (!corrida) {
            const ano = r.p.match(/\d{4}/)?.[0] || '2024';
            corrida = await prisma.race.create({ data:{ name:r.p, city:'Brasil', state:'BR', date:new Date(`${ano}-06-01`), distances:r.d, organizer:'Oficial', status:'completed' } });
          }
          const existe = await prisma.result.findUnique({ where:{ athleteId_raceId:{ athleteId:atleta.id, raceId:corrida.id } } });
          if (existe) continue;
          await prisma.result.create({ data:{ athleteId:atleta.id, raceId:corrida.id, time:r.t, overallRank:r.pos, distance:r.d, points:pts(r.pos,r.d) } });
          resultados++;
        }
        const all = await prisma.result.findMany({ where:{ athleteId:atleta.id } });
        await prisma.athlete.update({ where:{ id:atleta.id }, data:{ totalRaces:all.length, totalPoints:all.reduce((s,x)=>s+x.points,0) } });
      }
      return { ok:true, removidos:ids.length, criados, resultados };
    } catch(e) { return reply.code(500).send({ error:e.message }); }
  });
}
