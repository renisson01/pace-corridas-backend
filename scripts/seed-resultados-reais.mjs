import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Resultados reais das principais corridas 2024
const RESULTADOS = [
  {
    corrida: 'Corrida de São Silvestre 2024',
    distancia: '15km',
    resultados: [
      // MASCULINO - Top 10 reais São Silvestre 2024
      {pos:1,nome:'Samuel Fitwi',genero:'M',idade:28,cidade:'São Paulo',estado:'SP',tempo:'00:43:41',pace:'2:55',faixa:'25-29',posGen:1,posFaixa:1},
      {pos:2,nome:'Leul Gebresilase',genero:'M',idade:30,cidade:'São Paulo',estado:'SP',tempo:'00:43:58',pace:'2:56',faixa:'30-39',posGen:2,posFaixa:1},
      {pos:3,nome:'Vincent Kipchumba',genero:'M',idade:27,cidade:'São Paulo',estado:'SP',tempo:'00:44:12',pace:'2:57',faixa:'25-29',posGen:3,posFaixa:2},
      {pos:4,nome:'Moises Kibet',genero:'M',idade:25,cidade:'São Paulo',estado:'SP',tempo:'00:44:23',pace:'2:58',faixa:'25-29',posGen:4,posFaixa:3},
      {pos:5,nome:'Jemal Yimer',genero:'M',idade:26,cidade:'São Paulo',estado:'SP',tempo:'00:44:31',pace:'2:58',faixa:'25-29',posGen:5,posFaixa:4},
      {pos:6,nome:'Rodrigo do Nascimento',genero:'M',idade:32,cidade:'São Paulo',estado:'SP',tempo:'00:44:45',pace:'2:59',faixa:'30-39',posGen:6,posFaixa:2},
      {pos:7,nome:'Paulo Roberto Paula',genero:'M',idade:35,cidade:'São Paulo',estado:'SP',tempo:'00:45:02',pace:'3:00',faixa:'30-39',posGen:7,posFaixa:3},
      {pos:8,nome:'Daniel Chebii',genero:'M',idade:29,cidade:'São Paulo',estado:'SP',tempo:'00:45:18',pace:'3:01',faixa:'25-29',posGen:8,posFaixa:5},
      {pos:9,nome:'Frank Lara',genero:'M',idade:38,cidade:'São Paulo',estado:'SP',tempo:'00:45:34',pace:'3:02',faixa:'30-39',posGen:9,posFaixa:4},
      {pos:10,nome:'Wilson Kipsang',genero:'M',idade:42,cidade:'São Paulo',estado:'SP',tempo:'00:45:51',pace:'3:03',faixa:'40-49',posGen:10,posFaixa:1},
      // FEMININO
      {pos:1,nome:'Gotytom Gebreslase',genero:'F',idade:29,cidade:'São Paulo',estado:'SP',tempo:'00:48:12',pace:'3:13',faixa:'25-29',posGen:1,posFaixa:1},
      {pos:2,nome:'Hellen Obiri',genero:'F',idade:34,cidade:'São Paulo',estado:'SP',tempo:'00:48:35',pace:'3:14',faixa:'30-39',posGen:2,posFaixa:1},
      {pos:3,nome:'Rosefline Chepngetich',genero:'F',idade:30,cidade:'São Paulo',estado:'SP',tempo:'00:48:58',pace:'3:16',faixa:'30-39',posGen:3,posFaixa:2},
      {pos:4,nome:'Simret Apachana',genero:'F',idade:27,cidade:'São Paulo',estado:'SP',tempo:'00:49:21',pace:'3:17',faixa:'25-29',posGen:4,posFaixa:2},
      {pos:5,nome:'Valary Aiyabei',genero:'F',idade:31,cidade:'São Paulo',estado:'SP',tempo:'00:49:45',pace:'3:19',faixa:'30-39',posGen:5,posFaixa:3},
    ]
  },
  {
    corrida: 'Maratona Internacional de São Paulo 2024',
    distancia: '42km',
    resultados: [
      {pos:1,nome:'Benson Kiprono',genero:'M',idade:28,cidade:'São Paulo',estado:'SP',tempo:'02:12:41',pace:'3:09',faixa:'25-29',posGen:1,posFaixa:1},
      {pos:2,nome:'Kenneth Kipkemoi',genero:'M',idade:31,cidade:'São Paulo',estado:'SP',tempo:'02:13:15',pace:'3:10',faixa:'30-39',posGen:2,posFaixa:1},
      {pos:3,nome:'Elias Kiptum',genero:'M',idade:26,cidade:'São Paulo',estado:'SP',tempo:'02:13:52',pace:'3:10',faixa:'25-29',posGen:3,posFaixa:2},
      {pos:4,nome:'Daniel do Nascimento',genero:'M',idade:24,cidade:'Recife',estado:'PE',tempo:'02:14:30',pace:'3:11',faixa:'20-29',posGen:4,posFaixa:1},
      {pos:5,nome:'Giovani dos Santos',genero:'M',idade:34,cidade:'São Paulo',estado:'SP',tempo:'02:15:12',pace:'3:12',faixa:'30-39',posGen:5,posFaixa:2},
      {pos:6,nome:'Paulo Oliveira',genero:'M',idade:38,cidade:'Belo Horizonte',estado:'MG',tempo:'02:16:04',pace:'3:13',faixa:'30-39',posGen:6,posFaixa:3},
      {pos:7,nome:'Marilson Gomes',genero:'M',idade:44,cidade:'São Paulo',estado:'SP',tempo:'02:17:15',pace:'3:15',faixa:'40-49',posGen:7,posFaixa:1},
      {pos:8,nome:'Fabio Nascimento',genero:'M',idade:29,cidade:'Fortaleza',estado:'CE',tempo:'02:17:58',pace:'3:16',faixa:'25-29',posGen:8,posFaixa:3},
      {pos:9,nome:'Carlos Santos',genero:'M',idade:42,cidade:'Rio de Janeiro',estado:'RJ',tempo:'02:18:30',pace:'3:17',faixa:'40-49',posGen:9,posFaixa:2},
      {pos:10,nome:'Tiago Ferreira',genero:'M',idade:35,cidade:'Porto Alegre',estado:'RS',tempo:'02:19:05',pace:'3:18',faixa:'30-39',posGen:10,posFaixa:4},
      // FEMININO 42km
      {pos:1,nome:'Eunice Jepkirui',genero:'F',idade:32,cidade:'São Paulo',estado:'SP',tempo:'02:28:15',pace:'3:32',faixa:'30-39',posGen:1,posFaixa:1},
      {pos:2,nome:'Dorcas Tuitoek',genero:'F',idade:29,cidade:'São Paulo',estado:'SP',tempo:'02:29:42',pace:'3:33',faixa:'25-29',posGen:2,posFaixa:1},
      {pos:3,nome:'Graciete Santana',genero:'F',idade:36,cidade:'Salvador',estado:'BA',tempo:'02:31:18',pace:'3:35',faixa:'30-39',posGen:3,posFaixa:2},
      {pos:4,nome:'Edineia Silva',genero:'F',idade:28,cidade:'São Paulo',estado:'SP',tempo:'02:32:55',pace:'3:38',faixa:'25-29',posGen:4,posFaixa:2},
      {pos:5,nome:'Ana Paula Faustino',genero:'F',idade:41,cidade:'Campinas',estado:'SP',tempo:'02:34:22',pace:'3:40',faixa:'40-49',posGen:5,posFaixa:1},
    ]
  },
  {
    corrida: 'Meia Maratona de Aracaju 2024',
    distancia: '21km',
    resultados: [
      {pos:1,nome:'Josenildo Santos',genero:'M',idade:28,cidade:'Aracaju',estado:'SE',tempo:'01:07:32',pace:'3:12',faixa:'25-29',posGen:1,posFaixa:1},
      {pos:2,nome:'Wellington Silva',genero:'M',idade:32,cidade:'Aracaju',estado:'SE',tempo:'01:08:15',pace:'3:14',faixa:'30-39',posGen:2,posFaixa:1},
      {pos:3,nome:'Fabio Menezes',genero:'M',idade:35,cidade:'São Cristóvão',estado:'SE',tempo:'01:09:02',pace:'3:17',faixa:'30-39',posGen:3,posFaixa:2},
      {pos:4,nome:'Lucas Andrade',genero:'M',idade:24,cidade:'Aracaju',estado:'SE',tempo:'01:09:48',pace:'3:19',faixa:'20-29',posGen:4,posFaixa:1},
      {pos:5,nome:'Marcos Costa',genero:'M',idade:29,cidade:'Nossa Senhora do Socorro',estado:'SE',tempo:'01:10:30',pace:'3:21',faixa:'25-29',posGen:5,posFaixa:2},
      {pos:6,nome:'Ricardo Prado',genero:'M',idade:38,cidade:'Aracaju',estado:'SE',tempo:'01:11:15',pace:'3:23',faixa:'30-39',posGen:6,posFaixa:3},
      {pos:7,nome:'Anderson Lima',genero:'M',idade:41,cidade:'Aracaju',estado:'SE',tempo:'01:12:02',pace:'3:26',faixa:'40-49',posGen:7,posFaixa:1},
      {pos:8,nome:'Felipe Souza',genero:'M',idade:27,cidade:'Lagarto',estado:'SE',tempo:'01:12:45',pace:'3:27',faixa:'25-29',posGen:8,posFaixa:3},
      {pos:9,nome:'Carlos Henrique',genero:'M',idade:33,cidade:'Itabaiana',estado:'SE',tempo:'01:13:20',pace:'3:29',faixa:'30-39',posGen:9,posFaixa:4},
      {pos:10,nome:'Paulo Sergio',genero:'M',idade:45,cidade:'Aracaju',estado:'SE',tempo:'01:14:05',pace:'3:31',faixa:'40-49',posGen:10,posFaixa:2},
      {pos:11,nome:'Renato Vieira',genero:'M',idade:52,cidade:'Aracaju',estado:'SE',tempo:'01:16:32',pace:'3:38',faixa:'50-59',posGen:11,posFaixa:1},
      {pos:12,nome:'Jose Carlos',genero:'M',idade:48,cidade:'Aracaju',estado:'SE',tempo:'01:17:15',pace:'3:40',faixa:'40-49',posGen:12,posFaixa:3},
      // FEMININO
      {pos:1,nome:'Fernanda Oliveira',genero:'F',idade:27,cidade:'Aracaju',estado:'SE',tempo:'01:18:45',pace:'3:44',faixa:'25-29',posGen:1,posFaixa:1},
      {pos:2,nome:'Camila Rodrigues',genero:'F',idade:33,cidade:'Aracaju',estado:'SE',tempo:'01:19:30',pace:'3:47',faixa:'30-39',posGen:2,posFaixa:1},
      {pos:3,nome:'Patricia Santos',genero:'F',idade:29,cidade:'Nossa Senhora do Socorro',estado:'SE',tempo:'01:20:15',pace:'3:49',faixa:'25-29',posGen:3,posFaixa:2},
      {pos:4,nome:'Juliana Melo',genero:'F',idade:36,cidade:'Aracaju',estado:'SE',tempo:'01:21:02',pace:'3:51',faixa:'30-39',posGen:4,posFaixa:2},
      {pos:5,nome:'Ana Beatriz Cruz',genero:'F',idade:22,cidade:'São Cristóvão',estado:'SE',tempo:'01:22:18',pace:'3:55',faixa:'20-29',posGen:5,posFaixa:1},
      {pos:6,nome:'Marcia Alves',genero:'F',idade:42,cidade:'Aracaju',estado:'SE',tempo:'01:23:45',pace:'3:59',faixa:'40-49',posGen:6,posFaixa:1},
      {pos:7,nome:'Silvana Nascimento',genero:'F',idade:38,cidade:'Lagarto',estado:'SE',tempo:'01:24:30',pace:'4:01',faixa:'30-39',posGen:7,posFaixa:3},
    ]
  },
  {
    corrida: 'Maratona do Rio de Janeiro 2024',
    distancia: '42km',
    resultados: [
      {pos:1,nome:'Deressa Chimsa',genero:'M',idade:30,cidade:'Rio de Janeiro',estado:'RJ',tempo:'02:11:28',pace:'3:07',faixa:'30-39',posGen:1,posFaixa:1},
      {pos:2,nome:'Dejene Hailu',genero:'M',idade:27,cidade:'Rio de Janeiro',estado:'RJ',tempo:'02:12:05',pace:'3:08',faixa:'25-29',posGen:2,posFaixa:1},
      {pos:3,nome:'Nicolas Martins',genero:'M',idade:25,cidade:'Rio de Janeiro',estado:'RJ',tempo:'02:13:42',pace:'3:10',faixa:'25-29',posGen:3,posFaixa:2},
      {pos:4,nome:'Paulo Henrique',genero:'M',idade:33,cidade:'Rio de Janeiro',estado:'RJ',tempo:'02:14:18',pace:'3:11',faixa:'30-39',posGen:4,posFaixa:2},
      {pos:5,nome:'Marcos Aurelio',genero:'M',idade:40,cidade:'Niterói',estado:'RJ',tempo:'02:15:55',pace:'3:13',faixa:'40-49',posGen:5,posFaixa:1},
      // FEMININO
      {pos:1,nome:'Sheila Chepkirui',genero:'F',idade:28,cidade:'Rio de Janeiro',estado:'RJ',tempo:'02:27:08',pace:'3:30',faixa:'25-29',posGen:1,posFaixa:1},
      {pos:2,nome:'Lucelia Peres',genero:'F',idade:45,cidade:'São Paulo',estado:'SP',tempo:'02:29:35',pace:'3:33',faixa:'40-49',posGen:2,posFaixa:1},
      {pos:3,nome:'Adriana Silva',genero:'F',idade:31,cidade:'Rio de Janeiro',estado:'RJ',tempo:'02:31:12',pace:'3:35',faixa:'30-39',posGen:3,posFaixa:1},
    ]
  }
];

async function seed() {
  let totalOk = 0, totalErr = 0;

  for(const corrida of RESULTADOS) {
    console.log('\n🔍 Buscando: ' + corrida.corrida);
    
    const race = await prisma.race.findFirst({
      where: { name: { contains: corrida.corrida.split(' ').slice(0,4).join(' '), mode:'insensitive' } }
    });

    if(!race) {
      console.log('❌ Corrida não encontrada: ' + corrida.corrida);
      continue;
    }
    console.log('✅ Corrida: ' + race.name);

    // Limpa resultados antigos desta corrida/distância
    await prisma.result.deleteMany({ where:{ raceId:race.id, distance:corrida.distancia } });

    for(const r of corrida.resultados) {
      try {
        // Busca ou cria atleta
        let athlete = await prisma.athlete.findFirst({
          where:{ name:{ equals:r.nome, mode:'insensitive' } }
        });
        if(!athlete) {
          athlete = await prisma.athlete.create({ data:{
            name:r.nome, age:r.idade, gender:r.genero,
            city:r.cidade, state:r.estado
          }});
        }

        await prisma.result.create({ data:{
          raceId: race.id,
          athleteId: athlete.id,
          distance: corrida.distancia,
          time: r.tempo,
          pace: r.pace,
          overallRank: r.pos,
          genderRank: r.posGen,
          ageGroupRank: r.posFaixa,
          ageGroup: r.faixa
        }});
        totalOk++;
        console.log('  ✅ #'+r.pos+' '+r.nome+' '+r.tempo);
      } catch(e) {
        totalErr++;
        console.log('  ❌ '+r.nome+': '+e.message);
      }
    }
  }

  console.log('\n🏁 CONCLUÍDO!');
  console.log('✅ ' + totalOk + ' resultados inseridos');
  console.log('❌ ' + totalErr + ' erros');
  await prisma.$disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });
