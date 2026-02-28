import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const NOMES_M = ['João','Pedro','Carlos','André','Lucas','Rafael','Bruno','Diego','Felipe','Marcos','Rodrigo','Eduardo','Gustavo','Thiago','Daniel','Ricardo','Fernando','Henrique','Leonardo','Alexandre','Paulo','Victor','Gabriel','Mateus','Fábio','Sandro','Márcio','Edson','Wilson','Roberto','Luiz','Jorge','Antonio','Francisco','Raimundo','Sebastião','Antônio','José','Manoel','Valter'];
const NOMES_F = ['Ana','Maria','Juliana','Fernanda','Camila','Patrícia','Luciana','Adriana','Tatiane','Renata','Vanessa','Simone','Priscila','Cristiane','Daniela','Márcia','Sandra','Regina','Cláudia','Beatriz','Larissa','Amanda','Letícia','Natália','Viviane','Mônica','Carla','Eliane','Rosana','Andréa'];
const SOBRENOMES = ['Silva','Santos','Oliveira','Souza','Lima','Pereira','Costa','Ferreira','Rodrigues','Alves','Nascimento','Carvalho','Gomes','Martins','Ribeiro','Araújo','Mendes','Barbosa','Cardoso','Castro','Moreira','Nunes','Freitas','Cunha','Lopes','Marques','Andrade','Teixeira','Pinto','Ramos'];
const CIDADES = [
  {c:'Aracaju',e:'SE'},{c:'São Paulo',e:'SP'},{c:'Rio de Janeiro',e:'RJ'},{c:'Fortaleza',e:'CE'},
  {c:'Salvador',e:'BA'},{c:'Recife',e:'PE'},{c:'Manaus',e:'AM'},{c:'Curitiba',e:'PR'},
  {c:'Porto Alegre',e:'RS'},{c:'Belém',e:'PA'},{c:'Goiânia',e:'GO'},{c:'Florianópolis',e:'SC'},
  {c:'Brasília',e:'DF'},{c:'Natal',e:'RN'},{c:'Maceió',e:'AL'},{c:'Teresina',e:'PI'},
  {c:'Campo Grande',e:'MS'},{c:'João Pessoa',e:'PB'},{c:'São Luís',e:'MA'},{c:'Macapá',e:'AP'},
  {c:'Lagarto',e:'SE'},{c:'Itabaiana',e:'SE'},{c:'Estância',e:'SE'},{c:'Tobias Barreto',e:'SE'},
  {c:'Nossa Senhora da Glória',e:'SE'},{c:'Campinas',e:'SP'},{c:'Santos',e:'SP'},{c:'Sorocaba',e:'SP'},
  {c:'Belo Horizonte',e:'MG'},{c:'Uberlândia',e:'MG'},{c:'Vitória',e:'ES'},{c:'Londrina',e:'PR'},
];

const PROVAS = await prisma.race.findMany({ where: { status: 'completed' }, take: 100 });
if (!PROVAS.length) { console.log('❌ Sem corridas completed'); process.exit(1); }

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[rnd(0, arr.length - 1)]; }

function gerarTempo(distancia, nivel) {
  // nivel: 0=elite, 1=avancado, 2=intermediario, 3=iniciante
  const bases = {
    '5km':  [[14,16],[17,20],[21,28],[29,45]],
    '10km': [[29,33],[34,40],[41,55],[56,90]],
    '21km': [[62,72],[73,90],[91,120],[121,180]],
    '42km': [[128,145],[146,175],[176,240],[241,360]],
    '15km': [[43,50],[51,62],[63,85],[86,120]],
    '3km':  [[8,10],[10,13],[13,18],[18,30]],
    '6km':  [[17,21],[22,26],[27,35],[36,55]],
    '8km':  [[23,27],[28,34],[35,45],[46,70]],
    '18km': '[55,65],[66,80],[81,110],[111,160]'.split('],[').map(x=>x.replace(/[\[\]]/g,'').split(',').map(Number)),
  };
  const dist = Object.keys(bases).find(k => distancia?.includes(k.replace('km',''))) || '10km';
  const [min, max] = (bases[dist] || bases['10km'])[nivel];
  const totalMin = rnd(min, max);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const s = rnd(0, 59);
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
}

function calcPace(tempo, distancia) {
  const dist = parseFloat(distancia) || 10;
  const partes = tempo.split(':').map(Number);
  const totalSec = partes.length === 3 ? partes[0]*3600+partes[1]*60+partes[2] : partes[0]*60+partes[1];
  const paceMin = Math.floor((totalSec/dist)/60);
  const paceSec = Math.floor((totalSec/dist)%60);
  return `${paceMin}:${String(paceSec).padStart(2,'0')}/km`;
}

async function seed() {
  console.log('🚀 Iniciando seed de massa...');
  console.log(`📊 Corridas disponíveis: ${PROVAS.length}`);
  
  const TOTAL = 5000; // 5k atletas x ~10 resultados = ~50k resultados
  let atletasCriados = 0, resultadosCriados = 0;

  for (let i = 0; i < TOTAL; i++) {
    const genero = Math.random() > 0.4 ? 'M' : 'F';
    const nomes = genero === 'M' ? NOMES_M : NOMES_F;
    const nome = `${pick(nomes)} ${pick(SOBRENOMES)} ${pick(SOBRENOMES)}`;
    const local = pick(CIDADES);
    const idade = rnd(18, 65);
    const nivelAtleta = rnd(0, 3); // 0=elite, 3=iniciante
    const numCorridas = rnd(1, Math.min(15, PROVAS.length));

    // Criar atleta
    const atleta = await prisma.athlete.create({
      data: {
        name: nome, city: local.c, state: local.e,
        gender: genero, age: idade,
        totalRaces: 0, totalPoints: 0,
      }
    });
    atletasCriados++;

    // Criar resultados para esse atleta
    const provasSelecionadas = PROVAS
      .sort(() => Math.random() - 0.5)
      .slice(0, numCorridas);

    let pontosTotais = 0;
    let corridasTotais = 0;

    for (const prova of provasSelecionadas) {
      const distancias = prova.distances?.split(',') || ['10km'];
      const distancia = pick(distancias).trim();
      const tempo = gerarTempo(distancia, nivelAtleta);
      const pace = calcPace(tempo, distancia.replace('km',''));

      // Rank baseado no nível (com variação)
      const rankBase = nivelAtleta === 0 ? rnd(1,10) :
                       nivelAtleta === 1 ? rnd(5,50) :
                       nivelAtleta === 2 ? rnd(20,200) : rnd(100,1000);

      const pontos = Math.max(10, 1000 - rankBase * 5);
      pontosTotais += pontos;
      corridasTotais++;

      try {
        await prisma.result.create({
          data: {
            athleteId: atleta.id,
            raceId: prova.id,
            time: tempo,
            pace,
            overallRank: rankBase,
            distance: distancia,
            points: pontos,
          }
        });
        resultadosCriados++;
      } catch(e) { /* duplicata, ignorar */ }
    }

    // Atualizar totais
    await prisma.athlete.update({
      where: { id: atleta.id },
      data: { totalRaces: corridasTotais, totalPoints: pontosTotais }
    });

    // Log progresso
    if ((i+1) % 500 === 0) {
      const pct = Math.round((i+1)/TOTAL*100);
      console.log(`⏳ ${pct}% - ${atletasCriados} atletas | ${resultadosCriados} resultados`);
    }
  }

  const [totalA, totalR] = await Promise.all([prisma.athlete.count(), prisma.result.count()]);
  console.log('\n════════════════════════════');
  console.log(`✅ CONCLUÍDO!`);
  console.log(`👤 Total atletas: ${totalA}`);
  console.log(`🏅 Total resultados: ${totalR}`);
  await prisma.$disconnect();
}

seed().catch(console.error);
