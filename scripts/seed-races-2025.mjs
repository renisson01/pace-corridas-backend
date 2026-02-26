
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CORRIDAS_2025 = [
  // SERGIPE
  { name:'Meia Maratona de Aracaju 2025', city:'Aracaju', state:'SE', date:'2025-08-10', distances:'21km,10km,5km', organizer:'FSATSE', status:'upcoming', url:'https://www.fsatse.com.br' },
  { name:'Corrida Cidade de Aracaju 2025', city:'Aracaju', state:'SE', date:'2025-06-15', distances:'10km,5km', organizer:'FSATSE', status:'upcoming' },
  { name:'Corrida Zé do Bairro 2025', city:'Aracaju', state:'SE', date:'2025-05-01', distances:'5km,3km', organizer:'Prefeitura', status:'upcoming' },
  { name:'Corrida da Mulher Aracaju 2025', city:'Aracaju', state:'SE', date:'2025-03-08', distances:'5km', organizer:'FSATSE', status:'completed' },
  { name:'Electric Run Aracaju 2025', city:'Aracaju', state:'SE', date:'2025-04-12', distances:'5km', organizer:'Electric Run', status:'upcoming' },

  // SÃO PAULO
  { name:'Maratona Internacional de São Paulo 2025', city:'São Paulo', state:'SP', date:'2025-06-01', distances:'42km,21km', organizer:'Corinthians Run', status:'upcoming', url:'https://www.maratonasp.com.br' },
  { name:'Meia Maratona de São Paulo 2025', city:'São Paulo', state:'SP', date:'2025-05-11', distances:'21km,10km', organizer:'Track&Field', status:'upcoming' },
  { name:'Corrida de São Silvestre 2025', city:'São Paulo', state:'SP', date:'2025-12-31', distances:'15km', organizer:'Sao Silvestre', status:'upcoming', url:'https://www.saosilvestre.com.br' },
  { name:'Volta da Pampulha 2025', city:'Belo Horizonte', state:'MG', date:'2025-05-18', distances:'18km', organizer:'Sesc', status:'upcoming' },

  // RIO DE JANEIRO
  { name:'Maratona do Rio de Janeiro 2025', city:'Rio de Janeiro', state:'RJ', date:'2025-06-08', distances:'42km,21km,10km', organizer:'Rio Marathon', status:'upcoming', url:'https://www.maratonario.com.br' },
  { name:'Meia Maratona do Rio 2025', city:'Rio de Janeiro', state:'RJ', date:'2025-07-13', distances:'21km,10km', organizer:'Rio Marathon', status:'upcoming' },

  // NORDESTE
  { name:'Maratona de Salvador 2025', city:'Salvador', state:'BA', date:'2025-08-24', distances:'42km,21km', organizer:'Salvador Run', status:'upcoming' },
  { name:'Meia Maratona de Recife 2025', city:'Recife', state:'PE', date:'2025-07-20', distances:'21km,10km', organizer:'Recife Run', status:'upcoming' },
  { name:'Maratona de Fortaleza 2025', city:'Fortaleza', state:'CE', date:'2025-09-07', distances:'42km,21km', organizer:'Fortaleza Run', status:'upcoming' },

  // SUL
  { name:'Maratona de Porto Alegre 2025', city:'Porto Alegre', state:'RS', date:'2025-06-29', distances:'42km,21km,10km', organizer:'POA Run', status:'upcoming' },
  { name:'Maratona de Florianópolis 2025', city:'Florianópolis', state:'SC', date:'2025-08-03', distances:'42km,21km', organizer:'Florian Run', status:'upcoming' },
  { name:'Corrida Internacional de Curitiba 2025', city:'Curitiba', state:'PR', date:'2025-05-25', distances:'42km,21km,10km', organizer:'Curitiba Run', status:'upcoming' },

  // CENTRO-OESTE
  { name:'Maratona de Brasília 2025', city:'Brasília', state:'DF', date:'2025-05-11', distances:'42km,21km', organizer:'BSB Run', status:'upcoming' },
  { name:'Corrida do Pantanal 2025', city:'Campo Grande', state:'MS', date:'2025-07-06', distances:'21km,10km,5km', organizer:'MS Run', status:'upcoming' },

  // JÁ REALIZADAS 2024
  { name:'Maratona Internacional de São Paulo 2024', city:'São Paulo', state:'SP', date:'2024-06-02', distances:'42km,21km', organizer:'Corinthians Run', status:'completed' },
  { name:'Corrida de São Silvestre 2024', city:'São Paulo', state:'SP', date:'2024-12-31', distances:'15km', organizer:'Sao Silvestre', status:'completed' },
  { name:'Meia Maratona de Aracaju 2024', city:'Aracaju', state:'SE', date:'2024-08-11', distances:'21km,10km,5km', organizer:'FSATSE', status:'completed' },
  { name:'Maratona do Rio de Janeiro 2024', city:'Rio de Janeiro', state:'RJ', date:'2024-06-09', distances:'42km,21km', organizer:'Rio Marathon', status:'completed' },
];

async function seed() {
  let created=0, skip=0;
  for(const r of CORRIDAS_2025) {
    const exists = await prisma.race.findFirst({ where:{ name:r.name } });
    if(exists) { skip++; continue; }
    await prisma.race.create({ data:{
      name:r.name, city:r.city, state:r.state,
      date:new Date(r.date), distances:r.distances,
      organizer:r.organizer, status:r.status,
      registrationUrl:r.url||null
    }});
    created++;
  }
  console.log('✅ '+created+' corridas criadas, '+skip+' já existiam');
  await prisma.$disconnect();
}
seed().catch(e=>{console.error(e);process.exit(1);});
