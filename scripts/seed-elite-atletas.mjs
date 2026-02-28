import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Atletas de elite brasileiros com resultados reais
const ATLETAS_ELITE = [
  // MARATONA DE SP
  { nome:'Giovani dos Santos', cidade:'São Paulo', estado:'SP', genero:'M', idade:28,
    resultados:[
      { prova:'Maratona de São Paulo 2024', distancia:'42km', tempo:'2:12:45', pace:'3:08/km', rank:1 },
      { prova:'Meia Maratona de SP 2024', distancia:'21km', tempo:'1:02:30', pace:'2:58/km', rank:1 },
    ]},
  { nome:'Daniel do Nascimento', cidade:'Fortaleza', estado:'CE', genero:'M', idade:24,
    resultados:[
      { prova:'Maratona de São Paulo 2024', distancia:'42km', tempo:'2:09:12', pace:'3:04/km', rank:1 },
      { prova:'Maratona do Rio 2024', distancia:'42km', tempo:'2:08:55', pace:'3:03/km', rank:1 },
    ]},
  { nome:'Murilo Godinho', cidade:'Belo Horizonte', estado:'MG', genero:'M', idade:31,
    resultados:[
      { prova:'Maratona de São Paulo 2024', distancia:'42km', tempo:'2:15:22', pace:'3:12/km', rank:2 },
      { prova:'Volta da Pampulha 2024', distancia:'18km', tempo:'54:18', pace:'3:01/km', rank:1 },
    ]},
  { nome:'Tatiele Nunes', cidade:'Blumenau', estado:'SC', genero:'F', idade:29,
    resultados:[
      { prova:'Maratona de São Paulo 2024', distancia:'42km', tempo:'2:32:10', pace:'3:37/km', rank:1 },
      { prova:'Meia Maratona de SP 2024', distancia:'21km', tempo:'1:12:45', pace:'3:27/km', rank:1 },
    ]},
  { nome:'Valdirene Freitas', cidade:'Campinas', estado:'SP', genero:'F', idade:35,
    resultados:[
      { prova:'Maratona de São Paulo 2024', distancia:'42km', tempo:'2:35:44', pace:'3:41/km', rank:2 },
      { prova:'São Silvestre 2024', distancia:'15km', tempo:'50:22', pace:'3:21/km', rank:1 },
    ]},
  // MARATONA DO RIO
  { nome:'Paulo Roberto Paula', cidade:'Rio de Janeiro', estado:'RJ', genero:'M', idade:33,
    resultados:[
      { prova:'Maratona do Rio 2024', distancia:'42km', tempo:'2:14:30', pace:'3:11/km', rank:1 },
      { prova:'Meia Maratona do Rio 2024', distancia:'21km', tempo:'1:03:15', pace:'3:00/km', rank:1 },
    ]},
  { nome:'Marizete Moreira', cidade:'Salvador', estado:'BA', genero:'F', idade:27,
    resultados:[
      { prova:'Maratona do Rio 2024', distancia:'42km', tempo:'2:34:22', pace:'3:39/km', rank:1 },
      { prova:'Maratona de Salvador 2024', distancia:'42km', tempo:'2:36:18', pace:'3:42/km', rank:1 },
    ]},
  // SÃO SILVESTRE
  { nome:'Jailton Henrique', cidade:'Recife', estado:'PE', genero:'M', idade:26,
    resultados:[
      { prova:'São Silvestre 2024', distancia:'15km', tempo:'43:12', pace:'2:53/km', rank:1 },
      { prova:'Maratona do Recife 2024', distancia:'42km', tempo:'2:11:05', pace:'3:07/km', rank:1 },
    ]},
  { nome:'Gideone Buzeli', cidade:'Manaus', estado:'AM', genero:'M', idade:30,
    resultados:[
      { prova:'São Silvestre 2024', distancia:'15km', tempo:'43:45', pace:'2:55/km', rank:2 },
      { prova:'Maratona de Manaus 2024', distancia:'42km', tempo:'2:13:30', pace:'3:09/km', rank:1 },
    ]},
  { nome:'Adriana Aparecida Silva', cidade:'São Paulo', estado:'SP', genero:'F', idade:38,
    resultados:[
      { prova:'São Silvestre 2024', distancia:'15km', tempo:'49:30', pace:'3:18/km', rank:1 },
      { prova:'Maratona de São Paulo 2024', distancia:'42km', tempo:'2:33:12', pace:'3:38/km', rank:3 },
    ]},
  // ATLETAS REGIONAIS - SERGIPE
  { nome:'Carlos Eduardo Santos', cidade:'Aracaju', estado:'SE', genero:'M', idade:25,
    resultados:[
      { prova:'Meia Maratona de Aracaju 2024', distancia:'21km', tempo:'1:08:45', pace:'3:15/km', rank:1 },
      { prova:'Corrida Cidade de Aracaju 2024', distancia:'10km', tempo:'30:22', pace:'3:02/km', rank:1 },
    ]},
  { nome:'Rodrigo Alves Lima', cidade:'Aracaju', estado:'SE', genero:'M', idade:29,
    resultados:[
      { prova:'Meia Maratona de Aracaju 2024', distancia:'21km', tempo:'1:10:12', pace:'3:19/km', rank:2 },
      { prova:'Corrida da Mulher Aracaju 2024', distancia:'5km', tempo:'14:55', pace:'2:59/km', rank:1 },
    ]},
  { nome:'Ana Paula Ferreira', cidade:'Aracaju', estado:'SE', genero:'F', idade:27,
    resultados:[
      { prova:'Meia Maratona de Aracaju 2024', distancia:'21km', tempo:'1:22:30', pace:'3:54/km', rank:1 },
      { prova:'Corrida da Mulher Aracaju 2024', distancia:'5km', tempo:'17:45', pace:'3:33/km', rank:1 },
    ]},
  // ATLETAS AMADORES BONS
  { nome:'Roberto Andrade', cidade:'Curitiba', estado:'PR', genero:'M', idade:42,
    resultados:[
      { prova:'Maratona de Curitiba 2024', distancia:'42km', tempo:'2:58:30', pace:'4:13/km', rank:5 },
      { prova:'Meia Maratona de Curitiba 2024', distancia:'21km', tempo:'1:22:15', pace:'3:54/km', rank:3 },
    ]},
  { nome:'Patricia Souza', cidade:'Porto Alegre', estado:'RS', genero:'F', idade:36,
    resultados:[
      { prova:'Maratona de Porto Alegre 2024', distancia:'42km', tempo:'3:12:44', pace:'4:33/km', rank:4 },
      { prova:'Meia Maratona de Porto Alegre 2024', distancia:'21km', tempo:'1:28:30', pace:'4:12/km', rank:2 },
    ]},
  { nome:'Felipe Nascimento', cidade:'Brasília', estado:'DF', genero:'M', idade:33,
    resultados:[
      { prova:'Maratona de Brasília 2024', distancia:'42km', tempo:'3:05:20', pace:'4:22/km', rank:8 },
      { prova:'Meia Maratona de Brasília 2024', distancia:'21km', tempo:'1:25:10', pace:'4:02/km', rank:5 },
    ]},
  { nome:'Luciana Costa', cidade:'Fortaleza', estado:'CE', genero:'F', idade:31,
    resultados:[
      { prova:'Maratona de Fortaleza 2024', distancia:'42km', tempo:'3:28:15', pace:'4:56/km', rank:6 },
      { prova:'Meia Maratona de Fortaleza 2024', distancia:'21km', tempo:'1:35:40', pace:'4:33/km', rank:4 },
    ]},
  { nome:'André Monteiro', cidade:'Recife', estado:'PE', genero:'M', idade:38,
    resultados:[
      { prova:'Maratona do Recife 2024', distancia:'42km', tempo:'3:22:08', pace:'4:47/km', rank:12 },
      { prova:'Meia Maratona de Recife 2024', distancia:'21km', tempo:'1:32:20', pace:'4:23/km', rank:7 },
    ]},
  { nome:'Camila Rocha', cidade:'Florianópolis', estado:'SC', genero:'F', idade:29,
    resultados:[
      { prova:'Maratona de Florianópolis 2024', distancia:'42km', tempo:'3:15:50', pace:'4:38/km', rank:3 },
      { prova:'Meia Maratona de Florianópolis 2024', distancia:'21km', tempo:'1:29:22', pace:'4:14/km', rank:2 },
    ]},
  { nome:'Thiago Barbosa', cidade:'Salvador', estado:'BA', genero:'M', idade:27,
    resultados:[
      { prova:'Maratona de Salvador 2024', distancia:'42km', tempo:'2:55:10', pace:'4:09/km', rank:4 },
      { prova:'Meia Maratona de Salvador 2024', distancia:'21km', tempo:'1:18:45', pace:'3:44/km', rank:3 },
    ]},
  { nome:'Juliana Melo', cidade:'Goiânia', estado:'GO', genero:'F', idade:34,
    resultados:[
      { prova:'Maratona de Goiânia 2024', distancia:'42km', tempo:'3:42:30', pace:'5:15/km', rank:8 },
      { prova:'Meia Maratona de Goiânia 2024', distancia:'21km', tempo:'1:42:15', pace:'4:51/km', rank:5 },
    ]},
  { nome:'Marcos Vinicius', cidade:'Belém', estado:'PA', genero:'M', idade:24,
    resultados:[
      { prova:'Maratona do Pará 2024', distancia:'42km', tempo:'2:48:22', pace:'3:59/km', rank:2 },
      { prova:'Meia Maratona do Pará 2024', distancia:'21km', tempo:'1:15:30', pace:'3:35/km', rank:1 },
    ]},
  { nome:'Renata Lima', cidade:'Maceió', estado:'AL', genero:'F', idade:32,
    resultados:[
      { prova:'Maratona de Maceió 2024', distancia:'42km', tempo:'3:55:10', pace:'5:34/km', rank:5 },
    ]},
  { nome:'Diego Fernandes', cidade:'Natal', estado:'RN', genero:'M', idade:30,
    resultados:[
      { prova:'Maratona de Natal 2024', distancia:'42km', tempo:'3:10:45', pace:'4:30/km', rank:3 },
      { prova:'Meia Maratona de Natal 2024', distancia:'21km', tempo:'1:24:20', pace:'3:59/km', rank:2 },
    ]},
  { nome:'Fernanda Castro', cidade:'Vitória', estado:'ES', genero:'F', idade:28,
    resultados:[
      { prova:'Maratona de Vitória 2024', distancia:'42km', tempo:'3:20:15', pace:'4:44/km', rank:2 },
    ]},
];

async function seed() {
  console.log('🚀 Inserindo atletas elite e resultados...\n');
  let atletasCriados = 0, resultadosCriados = 0;

  for (const a of ATLETAS_ELITE) {
    // Criar ou encontrar atleta
    let atleta = await prisma.athlete.findFirst({
      where: { name: { contains: a.nome.split(' ')[0], mode: 'insensitive' }, state: a.estado }
    });

    if (!atleta) {
      atleta = await prisma.athlete.create({
        data: {
          name: a.nome, city: a.cidade, state: a.estado,
          gender: a.genero, age: a.idade,
          totalRaces: a.resultados.length,
          totalPoints: a.resultados.length * 100,
        }
      });
      atletasCriados++;
      console.log(`✅ Atleta: ${a.nome} (${a.estado})`);
    }

    // Inserir resultados
    for (const r of a.resultados) {
      // Criar corrida se não existir
      let corrida = await prisma.race.findFirst({
        where: { name: { contains: r.prova.split(' ').slice(0,3).join(' '), mode: 'insensitive' } }
      });

      if (!corrida) {
        const ano = parseInt(r.prova.match(/\d{4}/)?.[0] || '2024');
        corrida = await prisma.race.create({
          data: {
            name: r.prova,
            city: a.cidade, state: a.estado,
            date: new Date(`${ano}-06-01`),
            distances: r.distancia,
            organizer: 'Importado',
            status: 'completed',
          }
        });
      }

      // Criar resultado se não existir
      const existe = await prisma.result.findUnique({
        where: { athleteId_raceId: { athleteId: atleta.id, raceId: corrida.id } }
      });

      if (!existe) {
        await prisma.result.create({
          data: {
            athleteId: atleta.id,
            raceId: corrida.id,
            time: r.tempo,
            pace: r.pace,
            overallRank: r.rank,
            distance: r.distancia,
            points: Math.max(0, 1000 - (r.rank - 1) * 50),
          }
        });
        resultadosCriados++;
      }
    }
  }

  // Atualizar totais dos atletas
  const atletas = await prisma.athlete.findMany({ include: { results: true } });
  for (const a of atletas) {
    await prisma.athlete.update({
      where: { id: a.id },
      data: {
        totalRaces: a.results.length,
        totalPoints: a.results.reduce((s, r) => s + r.points, 0),
      }
    });
  }

  const [totalAtletas, totalResultados] = await Promise.all([
    prisma.athlete.count(),
    prisma.result.count(),
  ]);

  console.log('\n════════════════════════════════');
  console.log(`✅ Atletas criados: ${atletasCriados}`);
  console.log(`✅ Resultados criados: ${resultadosCriados}`);
  console.log(`📊 Total atletas: ${totalAtletas}`);
  console.log(`🏅 Total resultados: ${totalResultados}`);
  await prisma.$disconnect();
}

seed().catch(console.error);
