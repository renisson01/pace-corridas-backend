import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CORRIDAS = [
  // SÃO PAULO
  { name:'Maratona de São Paulo 2026', city:'São Paulo', state:'SP', date:'2026-04-26', distances:'21km,42km', organizer:'Yescom', status:'upcoming', registrationUrl:'https://www.maratonadesaopaulo.com.br' },
  { name:'Meia Maratona Internacional de SP 2026', city:'São Paulo', state:'SP', date:'2026-05-31', distances:'21km', organizer:'Yescom', status:'upcoming', registrationUrl:'https://www.meiamaratonadesaopaulo.com.br' },
  { name:'Corrida de São Silvestre 2026', city:'São Paulo', state:'SP', date:'2026-12-31', distances:'15km', organizer:'Yescom', status:'upcoming', registrationUrl:'https://www.saosilvestre.com.br' },
  { name:'Track & Field Run Series SP 2026', city:'São Paulo', state:'SP', date:'2026-03-22', distances:'5km,10km,21km', organizer:'TFSports', status:'upcoming', registrationUrl:'https://www.tfeventos.com.br' },
  { name:'Corrida Herbalife São Paulo 2026', city:'São Paulo', state:'SP', date:'2026-04-12', distances:'5km,10km', organizer:'Herbalife', status:'upcoming', registrationUrl:'https://www.corridaherbalife.com.br' },
  { name:'Night Run São Paulo 2026', city:'São Paulo', state:'SP', date:'2026-06-13', distances:'5km,10km,21km', organizer:'NightRun', status:'upcoming', registrationUrl:'https://www.nightrun.com.br' },
  { name:'Maratona Pão de Açúcar de Revezamento 2026', city:'São Paulo', state:'SP', date:'2026-09-20', distances:'42km', organizer:'Pão de Açúcar', status:'upcoming', registrationUrl:'https://www.maratonapaodeacucar.com.br' },

  // RIO DE JANEIRO  
  { name:'Maratona do Rio 2026', city:'Rio de Janeiro', state:'RJ', date:'2026-06-07', distances:'10km,21km,42km', organizer:'Lagardère', status:'upcoming', registrationUrl:'https://www.maratonadorio.com.br' },
  { name:'Meia Maratona do Rio 2026', city:'Rio de Janeiro', state:'RJ', date:'2026-04-05', distances:'21km', organizer:'Lagardère', status:'upcoming', registrationUrl:'https://www.meiariomarathon.com.br' },
  { name:'Corrida de Reis Rio 2026', city:'Rio de Janeiro', state:'RJ', date:'2026-01-06', distances:'5km,10km', organizer:'AABB', status:'completed', registrationUrl:null },
  { name:'Volta da Pampulha 2026', city:'Belo Horizonte', state:'MG', date:'2026-05-10', distances:'18km', organizer:'AABB BH', status:'upcoming', registrationUrl:'https://www.voltadapampulha.com.br' },

  // MINAS GERAIS
  { name:'Maratona de Belo Horizonte 2026', city:'Belo Horizonte', state:'MG', date:'2026-08-30', distances:'10km,21km,42km', organizer:'Unlimited', status:'upcoming', registrationUrl:'https://www.maratonabh.com.br' },
  { name:'Corrida Internacional de BH 2026', city:'Belo Horizonte', state:'MG', date:'2026-05-17', distances:'5km,10km,15km', organizer:'AIMS', status:'upcoming', registrationUrl:null },

  // RIO GRANDE DO SUL
  { name:'Maratona de Porto Alegre 2026', city:'Porto Alegre', state:'RS', date:'2026-06-21', distances:'10km,21km,42km', organizer:'Full Time', status:'upcoming', registrationUrl:'https://www.maratonaportoalegre.com.br' },
  { name:'Corrida Volta dos Açorianos 2026', city:'Porto Alegre', state:'RS', date:'2026-01-20', distances:'12km', organizer:'AABB POA', status:'completed', registrationUrl:null },

  // PARANÁ
  { name:'Maratona de Curitiba 2026', city:'Curitiba', state:'PR', date:'2026-09-06', distances:'10km,21km,42km', organizer:'Maratona Curitiba', status:'upcoming', registrationUrl:'https://www.maratonacuritiba.com.br' },
  { name:'Corrida das Nações Curitiba 2026', city:'Curitiba', state:'PR', date:'2026-05-24', distances:'5km,10km', organizer:'Tropical Eventos', status:'upcoming', registrationUrl:null },

  // SANTA CATARINA
  { name:'Maratona de Florianópolis 2026', city:'Florianópolis', state:'SC', date:'2026-05-03', distances:'10km,21km,42km', organizer:'RPC Esportes', status:'upcoming', registrationUrl:'https://www.maratonadeflorianopolis.com.br' },
  { name:'Meia Maratona de Blumenau 2026', city:'Blumenau', state:'SC', date:'2026-07-19', distances:'21km', organizer:'Blumenau Eventos', status:'upcoming', registrationUrl:null },

  // BAHIA
  { name:'Maratona de Salvador 2026', city:'Salvador', state:'BA', date:'2026-07-12', distances:'10km,21km,42km', organizer:'FBA', status:'upcoming', registrationUrl:'https://www.maratonasalvador.com.br' },
  { name:'Corrida Cidade de Salvador 2026', city:'Salvador', state:'BA', date:'2026-03-29', distances:'5km,10km', organizer:'FABA', status:'upcoming', registrationUrl:null },

  // PERNAMBUCO
  { name:'Maratona do Recife 2026', city:'Recife', state:'PE', date:'2026-08-16', distances:'10km,21km,42km', organizer:'W2 Eventos', status:'upcoming', registrationUrl:'https://www.maratonadorecife.com.br' },
  { name:'Corrida do Galo Recife 2026', city:'Recife', state:'PE', date:'2026-03-08', distances:'5km,10km', organizer:'Sport Club', status:'upcoming', registrationUrl:null },

  // CEARÁ
  { name:'Maratona de Fortaleza 2026', city:'Fortaleza', state:'CE', date:'2026-07-05', distances:'10km,21km,42km', organizer:'Eventor', status:'upcoming', registrationUrl:'https://www.maratonadefortaleza.com.br' },
  { name:'Corrida Réveillon Fortaleza 2026', city:'Fortaleza', state:'CE', date:'2026-01-01', distances:'5km,10km', organizer:'FEES', status:'completed', registrationUrl:null },

  // GOIÁS/DF
  { name:'Maratona de Brasília 2026', city:'Brasília', state:'DF', date:'2026-04-19', distances:'5km,10km,21km,42km', organizer:'BrasCorreias', status:'upcoming', registrationUrl:'https://www.brasilcorrida.com.br' },
  { name:'Corrida do Servidor Público 2026', city:'Brasília', state:'DF', date:'2026-10-28', distances:'5km,10km', organizer:'FUNPRESP', status:'upcoming', registrationUrl:null },
  { name:'Maratona de Goiânia 2026', city:'Goiânia', state:'GO', date:'2026-05-17', distances:'10km,21km,42km', organizer:'Top Run', status:'upcoming', registrationUrl:null },

  // PARÁ
  { name:'Maratona do Pará 2026', city:'Belém', state:'PA', date:'2026-10-04', distances:'10km,21km,42km', organizer:'Eventor PA', status:'upcoming', registrationUrl:null },

  // AMAZONAS
  { name:'Maratona de Manaus 2026', city:'Manaus', state:'AM', date:'2026-06-13', distances:'10km,21km,42km', organizer:'Amazon Run', status:'upcoming', registrationUrl:null },

  // ALAGOAS
  { name:'Maratona de Maceió 2026', city:'Maceió', state:'AL', date:'2026-08-02', distances:'10km,21km,42km', organizer:'AL Running', status:'upcoming', registrationUrl:null },

  // RIO GRANDE DO NORTE
  { name:'Maratona de Natal 2026', city:'Natal', state:'RN', date:'2026-07-26', distances:'10km,21km,42km', organizer:'RN Esportes', status:'upcoming', registrationUrl:null },

  // ESPÍRITO SANTO
  { name:'Maratona de Vitória 2026', city:'Vitória', state:'ES', date:'2026-09-13', distances:'10km,21km,42km', organizer:'ES Eventos', status:'upcoming', registrationUrl:null },

  // MATO GROSSO DO SUL
  { name:'Maratona de Campo Grande 2026', city:'Campo Grande', state:'MS', date:'2026-08-09', distances:'10km,21km,42km', organizer:'MS Run', status:'upcoming', registrationUrl:null },
];

async function seed() {
  console.log('\n🚀 Inserindo corridas Brasil 2026\n');
  let criadas=0, skip=0;

  for(const c of CORRIDAS) {
    const existe = await prisma.race.findFirst({
      where:{ name:{ contains:c.name.split(' ').slice(0,4).join(' '), mode:'insensitive' } }
    });
    if(existe){ skip++; continue; }
    await prisma.race.create({ data:{ ...c, date:new Date(c.date) }});
    console.log('✅', c.state, '-', c.name);
    criadas++;
  }

  const total = await prisma.race.count();
  const porEstado = await prisma.race.groupBy({ by:['state'], _count:{id:true}, orderBy:{_count:{id:'desc'}} });

  console.log('\n════════════════════════════════');
  console.log('✅ Novas:', criadas, '| Já existiam:', skip);
  console.log('📊 Total no banco:', total);
  console.log('\n🗺️  Por estado:');
  porEstado.forEach(e => console.log(` ${e.state}: ${e._count.id}`));
  await prisma.$disconnect();
}
seed().catch(console.error);
