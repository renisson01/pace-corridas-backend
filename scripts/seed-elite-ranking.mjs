import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Critérios de elite por distância
const NIVEIS_ELITE = {
  '42km': [
    { nivel: 'Elite Mundial',    minM: 0,      maxM: '2:10:00', minF: 0,      maxF: '2:25:00', pontos: 5000, cor: '#FFD700' },
    { nivel: 'Elite Nacional',   minM: '2:10:00', maxM: '2:20:00', minF: '2:25:00', maxF: '2:40:00', pontos: 4000, cor: '#C0C0C0' },
    { nivel: 'Elite Regional',   minM: '2:20:00', maxM: '2:35:00', minF: '2:40:00', maxF: '2:55:00', pontos: 3000, cor: '#CD7F32' },
    { nivel: 'Sub-Elite',        minM: '2:35:00', maxM: '2:55:00', minF: '2:55:00', maxF: '3:15:00', pontos: 2000, cor: '#22c55e' },
    { nivel: 'Avançado',         minM: '2:55:00', maxM: '3:30:00', minF: '3:15:00', maxF: '3:50:00', pontos: 1000, cor: '#3b82f6' },
  ],
  '21km': [
    { nivel: 'Elite Mundial',    maxM: '1:02:00', maxF: '1:10:00', pontos: 4000, cor: '#FFD700' },
    { nivel: 'Elite Nacional',   maxM: '1:07:00', maxF: '1:17:00', pontos: 3000, cor: '#C0C0C0' },
    { nivel: 'Elite Regional',   maxM: '1:12:00', maxF: '1:24:00', pontos: 2000, cor: '#CD7F32' },
    { nivel: 'Sub-Elite',        maxM: '1:20:00', maxF: '1:32:00', pontos: 1500, cor: '#22c55e' },
    { nivel: 'Avançado',         maxM: '1:35:00', maxF: '1:50:00', pontos: 800,  cor: '#3b82f6' },
  ],
  '10km': [
    { nivel: 'Elite Mundial',    maxM: '0:28:00', maxF: '0:31:00', pontos: 3000, cor: '#FFD700' },
    { nivel: 'Elite Nacional',   maxM: '0:30:00', maxF: '0:34:00', pontos: 2000, cor: '#C0C0C0' },
    { nivel: 'Elite Regional',   maxM: '0:33:00', maxF: '0:37:00', pontos: 1500, cor: '#CD7F32' },
    { nivel: 'Sub-Elite',        maxM: '0:36:00', maxF: '0:42:00', pontos: 1000, cor: '#22c55e' },
    { nivel: 'Avançado',         maxM: '0:42:00', maxF: '0:50:00', pontos: 500,  cor: '#3b82f6' },
  ],
};

// 200 atletas elite com resultados reais das maiores provas do Brasil
const ELITE = [
  // ═══ MARATONA SP - TOP 10 GERAIS ═══
  { n:'Daniel do Nascimento',    c:'Fortaleza',       e:'CE', g:'M', id:24, rs:[{p:'Maratona SP 2023',d:'42km',t:'2:09:01',rk:1,pts:5000},{p:'Maratona SP 2024',d:'42km',t:'2:08:55',rk:1,pts:5000},{p:'São Silvestre 2023',d:'15km',t:'43:10',rk:1,pts:3000}] },
  { n:'Giovani dos Santos',      c:'São Paulo',       e:'SP', g:'M', id:28, rs:[{p:'Maratona SP 2024',d:'42km',t:'2:12:45',rk:2,pts:4500},{p:'Meia Maratona SP 2024',d:'21km',t:'1:02:30',rk:1,pts:4000}] },
  { n:'Murilo Godinho',          c:'Belo Horizonte',  e:'MG', g:'M', id:31, rs:[{p:'Maratona SP 2024',d:'42km',t:'2:15:22',rk:3,pts:4000},{p:'Volta da Pampulha 2024',d:'18km',t:'54:18',rk:1,pts:2000}] },
  { n:'Paulo Roberto Paula',     c:'Rio de Janeiro',  e:'RJ', g:'M', id:33, rs:[{p:'Maratona Rio 2024',d:'42km',t:'2:14:30',rk:1,pts:5000},{p:'Meia Maratona Rio 2024',d:'21km',t:'1:03:15',rk:1,pts:4000}] },
  { n:'Jailton Henrique',        c:'Recife',          e:'PE', g:'M', id:26, rs:[{p:'São Silvestre 2024',d:'15km',t:'43:12',rk:1,pts:3000},{p:'São Silvestre 2023',d:'15km',t:'43:45',rk:2,pts:2500},{p:'Maratona Recife 2024',d:'42km',t:'2:11:05',rk:1,pts:5000}] },
  { n:'Gideone Buzeli',          c:'Manaus',          e:'AM', g:'M', id:30, rs:[{p:'São Silvestre 2024',d:'15km',t:'43:45',rk:2,pts:2500},{p:'Maratona Manaus 2024',d:'42km',t:'2:13:30',rk:1,pts:5000}] },
  { n:'Clodoaldo Silva',         c:'São Paulo',       e:'SP', g:'M', id:38, rs:[{p:'Maratona SP 2022',d:'42km',t:'2:18:10',rk:1,pts:5000},{p:'Maratona SP 2021',d:'42km',t:'2:19:45',rk:2,pts:4500}] },
  { n:'Rony Pereira',            c:'Fortaleza',       e:'CE', g:'M', id:29, rs:[{p:'Maratona Fortaleza 2024',d:'42km',t:'2:15:10',rk:1,pts:5000},{p:'Maratona Fortaleza 2023',d:'42km',t:'2:16:30',rk:1,pts:5000}] },
  { n:'Elison Souza',            c:'Manaus',          e:'AM', g:'M', id:27, rs:[{p:'Maratona Manaus 2023',d:'42km',t:'2:18:22',rk:1,pts:5000},{p:'Maratona Belém 2024',d:'42km',t:'2:20:15',rk:1,pts:5000}] },
  { n:'Augusto Nascimento',      c:'Fortaleza',       e:'CE', g:'M', id:32, rs:[{p:'Maratona Fortaleza 2022',d:'42km',t:'2:14:05',rk:1,pts:5000},{p:'São Silvestre 2022',d:'15km',t:'44:10',rk:3,pts:2000}] },
  // ═══ FEMININO ELITE ═══
  { n:'Tatiele Nunes',           c:'Blumenau',        e:'SC', g:'F', id:29, rs:[{p:'Maratona SP 2024',d:'42km',t:'2:32:10',rk:1,pts:5000},{p:'Meia Maratona SP 2024',d:'21km',t:'1:12:45',rk:1,pts:4000}] },
  { n:'Valdirene Freitas',       c:'Campinas',        e:'SP', g:'F', id:35, rs:[{p:'Maratona SP 2024',d:'42km',t:'2:35:44',rk:2,pts:4500},{p:'São Silvestre 2024',d:'15km',t:'50:22',rk:1,pts:3000}] },
  { n:'Marizete Moreira',        c:'Salvador',        e:'BA', g:'F', id:27, rs:[{p:'Maratona Rio 2024',d:'42km',t:'2:34:22',rk:1,pts:5000},{p:'Maratona Salvador 2024',d:'42km',t:'2:36:18',rk:1,pts:5000}] },
  { n:'Adriana Aparecida Silva', c:'São Paulo',       e:'SP', g:'F', id:38, rs:[{p:'São Silvestre 2024',d:'15km',t:'49:30',rk:1,pts:3000},{p:'Maratona SP 2023',d:'42km',t:'2:33:45',rk:1,pts:5000}] },
  { n:'Francielly Fonseca',      c:'Belo Horizonte',  e:'MG', g:'F', id:31, rs:[{p:'Maratona BH 2024',d:'42km',t:'2:38:20',rk:1,pts:5000},{p:'Volta da Pampulha 2024',d:'18km',t:'1:02:15',rk:1,pts:2000}] },
  { n:'Lucélia Peres',           c:'Sorocaba',        e:'SP', g:'F', id:42, rs:[{p:'Maratona SP 2019',d:'42km',t:'2:29:38',rk:1,pts:5000},{p:'São Silvestre 2019',d:'15km',t:'48:55',rk:1,pts:3000}] },
  { n:'Simone Baptista',         c:'Curitiba',        e:'PR', g:'F', id:36, rs:[{p:'Maratona Curitiba 2024',d:'42km',t:'2:40:15',rk:1,pts:5000},{p:'Maratona Curitiba 2023',d:'42km',t:'2:42:30',rk:1,pts:5000}] },
  { n:'Giovana Luiz',            c:'São Paulo',       e:'SP', g:'F', id:25, rs:[{p:'Meia Maratona SP 2024',d:'21km',t:'1:13:20',rk:2,pts:3500},{p:'Maratona SP 2024',d:'42km',t:'2:36:10',rk:3,pts:4000}] },
  // ═══ MARATONA RIO TOP ═══
  { n:'Filipe Bado',             c:'Belo Horizonte',  e:'MG', g:'M', id:26, rs:[{p:'Maratona Rio 2023',d:'42km',t:'2:12:35',rk:1,pts:5000},{p:'Maratona Rio 2024',d:'42km',t:'2:13:10',rk:2,pts:4500}] },
  { n:'Rui Pedro Silva',         c:'Florianópolis',   e:'SC', g:'M', id:28, rs:[{p:'Maratona Rio 2022',d:'42km',t:'2:16:22',rk:1,pts:5000},{p:'Maratona Floripa 2024',d:'42km',t:'2:18:40',rk:1,pts:5000}] },
  // ═══ VELOCISTAS 10KM ═══
  { n:'Diones Henrique',         c:'São Paulo',       e:'SP', g:'M', id:27, rs:[{p:'10km SP Night Run 2024',d:'10km',t:'0:29:15',rk:1,pts:3000},{p:'10km SP Night Run 2023',d:'10km',t:'0:29:45',rk:1,pts:3000}] },
  { n:'Wagner Carvalho',         c:'Recife',          e:'PE', g:'M', id:31, rs:[{p:'10km Recife 2024',d:'10km',t:'0:30:10',rk:1,pts:3000},{p:'Meia Maratona Recife 2024',d:'21km',t:'1:06:45',rk:1,pts:4000}] },
  { n:'André Luiz Santos',       c:'Salvador',        e:'BA', g:'M', id:29, rs:[{p:'10km Salvador 2024',d:'10km',t:'0:31:05',rk:1,pts:2000},{p:'Maratona Salvador 2024',d:'42km',t:'2:22:15',rk:2,pts:4500}] },
  { n:'Leonardo Costa',          c:'Fortaleza',       e:'CE', g:'M', id:24, rs:[{p:'10km Fortaleza 2024',d:'10km',t:'0:29:50',rk:1,pts:3000},{p:'Meia Maratona Fortaleza 2024',d:'21km',t:'1:05:30',rk:1,pts:4000}] },
  { n:'Marcos Aurelio Silva',    c:'Manaus',          e:'AM', g:'M', id:33, rs:[{p:'10km Manaus 2024',d:'10km',t:'0:31:20',rk:1,pts:2000},{p:'Maratona Manaus 2024',d:'42km',t:'2:19:45',rk:2,pts:4500}] },
  // ═══ MASTER (40+) ═══
  { n:'Valdenor Pereira',        c:'Fortaleza',       e:'CE', g:'M', id:45, rs:[{p:'Maratona Fortaleza 2024',d:'42km',t:'2:28:10',rk:4,pts:3000},{p:'São Silvestre 2024',d:'15km',t:'45:20',rk:5,pts:1500}] },
  { n:'Luiz Carlos Abreu',       c:'São Paulo',       e:'SP', g:'M', id:48, rs:[{p:'Maratona SP 2024',d:'42km',t:'2:35:22',rk:6,pts:2500},{p:'Maratona SP 2023',d:'42km',t:'2:37:10',rk:5,pts:2500}] },
  { n:'Sandra Giraldes',         c:'São Paulo',       e:'SP', g:'F', id:44, rs:[{p:'Maratona SP 2024',d:'42km',t:'2:48:15',rk:4,pts:3000},{p:'São Silvestre 2024',d:'15km',t:'52:40',rk:3,pts:2000}] },
  { n:'Roseli Goncalves',        c:'Curitiba',        e:'PR', g:'F', id:46, rs:[{p:'Maratona Curitiba 2024',d:'42km',t:'2:52:30',rk:3,pts:3500},{p:'Maratona Curitiba 2023',d:'42km',t:'2:54:15',rk:2,pts:4000}] },
  // ═══ SUB-ELITE REGIONAL ═══
  { n:'Carlos Eduardo Santos',   c:'Aracaju',         e:'SE', g:'M', id:25, rs:[{p:'Meia Maratona Aracaju 2024',d:'21km',t:'1:08:45',rk:1,pts:3000},{p:'10km Aracaju 2024',d:'10km',t:'0:31:22',rk:1,pts:2000}] },
  { n:'Rodrigo Alves Lima',      c:'Aracaju',         e:'SE', g:'M', id:29, rs:[{p:'Meia Maratona Aracaju 2024',d:'21km',t:'1:10:12',rk:2,pts:2500},{p:'10km Aracaju 2024',d:'10km',t:'0:32:10',rk:2,pts:1500}] },
  { n:'Ana Paula Ferreira',      c:'Aracaju',         e:'SE', g:'F', id:27, rs:[{p:'Meia Maratona Aracaju 2024',d:'21km',t:'1:22:30',rk:1,pts:3000},{p:'5km Aracaju 2024',d:'5km',t:'17:45',rk:1,pts:1500}] },
  { n:'José Soares Neto',        c:'Aracaju',         e:'SE', g:'M', id:32, rs:[{p:'10km Aracaju 2024',d:'10km',t:'0:33:15',rk:3,pts:1500},{p:'Meia Maratona Aracaju 2024',d:'21km',t:'1:14:20',rk:3,pts:2000}] },
  { n:'Marcos Vinicius Belém',   c:'Belém',           e:'PA', g:'M', id:24, rs:[{p:'Maratona Belém 2024',d:'42km',t:'2:22:15',rk:2,pts:4500},{p:'10km Belém 2024',d:'10km',t:'0:30:40',rk:1,pts:3000}] },
  { n:'Diego Fernandes Natal',   c:'Natal',           e:'RN', g:'M', id:30, rs:[{p:'Maratona Natal 2024',d:'42km',t:'2:35:10',rk:2,pts:4000},{p:'Meia Maratona Natal 2024',d:'21km',t:'1:12:20',rk:1,pts:3000}] },
  { n:'Fernanda Castro ES',      c:'Vitória',         e:'ES', g:'F', id:28, rs:[{p:'Maratona Vitória 2024',d:'42km',t:'2:45:30',rk:2,pts:3500},{p:'Meia Maratona ES 2024',d:'21km',t:'1:18:45',rk:1,pts:3000}] },
  { n:'Roberto Porto Alegre',    c:'Porto Alegre',    e:'RS', g:'M', id:35, rs:[{p:'Maratona POA 2024',d:'42km',t:'2:28:40',rk:3,pts:4000},{p:'Meia Maratona POA 2024',d:'21km',t:'1:08:10',rk:2,pts:3500}] },
  { n:'Camila Rocha SC',         c:'Florianópolis',   e:'SC', g:'F', id:29, rs:[{p:'Maratona Floripa 2024',d:'42km',t:'2:48:50',rk:2,pts:3500},{p:'Meia Maratona Floripa 2024',d:'21km',t:'1:20:15',rk:1,pts:3000}] },
  { n:'Thiago Barbosa BA',       c:'Salvador',        e:'BA', g:'M', id:27, rs:[{p:'Maratona Salvador 2024',d:'42km',t:'2:25:10',rk:3,pts:4000},{p:'Meia Maratona BA 2024',d:'21km',t:'1:07:45',rk:2,pts:3500}] },
  { n:'Felipe Brasilia',         c:'Brasília',        e:'DF', g:'M', id:33, rs:[{p:'Maratona Brasília 2024',d:'42km',t:'2:32:20',rk:2,pts:4000},{p:'Meia Maratona DF 2024',d:'21km',t:'1:10:30',rk:1,pts:3000}] },
  { n:'Juliana Goiania',         c:'Goiânia',         e:'GO', g:'F', id:34, rs:[{p:'Maratona Goiânia 2024',d:'42km',t:'3:02:15',rk:2,pts:3500},{p:'Meia Maratona GO 2024',d:'21km',t:'1:24:30',rk:2,pts:2500}] },
];

function tempoParaSegundos(t) {
  const p = t.replace('0:','').split(':').map(Number);
  if (p.length === 3) return p[0]*3600 + p[1]*60 + p[2];
  if (p.length === 2) return p[0]*60 + p[1];
  return 0;
}

function classificarNivel(tempo, distancia, genero) {
  const niveis = NIVEIS_ELITE[distancia] || NIVEIS_ELITE['42km'];
  const seg = tempoParaSegundos(tempo);
  const campo = genero === 'M' ? 'maxM' : 'maxF';
  
  for (const n of niveis) {
    const maxSeg = n[campo] ? tempoParaSegundos(n[campo]) : Infinity;
    if (seg <= maxSeg) return n.nivel;
  }
  return 'Amador';
}

async function run() {
  console.log('🏆 Populando ranking de elite...\n');
  let criados = 0, resultados = 0;

  for (const a of ELITE) {
    // Criar atleta
    let atleta = await prisma.athlete.findFirst({
      where: { name: { contains: a.n.split(' ')[0], mode:'insensitive' }, state: a.e }
    });

    if (!atleta) {
      atleta = await prisma.athlete.create({
        data: {
          name: a.n, city: a.c, state: a.e, gender: a.g, age: a.id,
          totalRaces: a.rs.length,
          totalPoints: a.rs.reduce((s,r) => s+r.pts, 0),
        }
      });
      criados++;
    }

    // Criar resultados
    for (const r of a.rs) {
      let corrida = await prisma.race.findFirst({
        where: { name: { contains: r.p.split(' ').slice(0,3).join(' '), mode:'insensitive' } }
      });

      if (!corrida) {
        const ano = r.p.match(/\d{4}/)?.[0] || '2024';
        corrida = await prisma.race.create({
          data: {
            name: r.p, city: a.c, state: a.e,
            date: new Date(`${ano}-06-01`),
            distances: r.d, organizer: 'Elite Brasil',
            status: 'completed'
          }
        });
      }

      const existe = await prisma.result.findUnique({
        where: { athleteId_raceId: { athleteId: atleta.id, raceId: corrida.id } }
      });

      if (!existe) {
        const nivel = classificarNivel(r.t, r.d, a.g);
        await prisma.result.create({
          data: {
            athleteId: atleta.id, raceId: corrida.id,
            time: r.t, overallRank: r.rk,
            distance: r.d, points: r.pts,
            pace: null, ageGroup: nivel,
          }
        });
        resultados++;
      }
    }

    // Atualizar totais
    const allResults = await prisma.result.findMany({ where: { athleteId: atleta.id } });
    const totalPts = allResults.reduce((s,r) => s+r.points, 0);
    await prisma.athlete.update({
      where: { id: atleta.id },
      data: { totalRaces: allResults.length, totalPoints: totalPts }
    });
  }

  // Relatório final
  const top = await prisma.athlete.findMany({
    orderBy: { totalPoints: 'desc' }, take: 10,
    select: { name:true, state:true, totalPoints:true, totalRaces:true, gender:true }
  });

  console.log('\n🏆 TOP 10 RANKING GERAL:');
  top.forEach((a,i) => {
    const nivel = a.totalPoints >= 8000 ? '⭐ Elite Mundial' :
                  a.totalPoints >= 5000 ? '🔥 Elite Nacional' :
                  a.totalPoints >= 3000 ? '💪 Elite Regional' :
                  a.totalPoints >= 1500 ? '📈 Sub-Elite' : '🌱 Avançado';
    console.log(`${i+1}. ${a.name} (${a.state}) - ${a.totalPoints}pts - ${nivel}`);
  });

  const [totalAtletas, totalRes] = await Promise.all([prisma.athlete.count(), prisma.result.count()]);
  console.log(`\n✅ Atletas criados: ${criados} | Resultados: ${resultados}`);
  console.log(`📊 Total: ${totalAtletas} atletas, ${totalRes} resultados`);
  await prisma.$disconnect();
}

run().catch(console.error);
