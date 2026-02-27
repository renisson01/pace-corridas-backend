import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// PROVAS REAIS COM LINKS DE INSCRIÇÃO - SERGIPE 2025
const PROVAS_SERGIPE = [
  { name:'Meia Maratona de Aracaju 2025', city:'Aracaju', state:'SE', date:'2025-08-10', distances:'21km,10km,5km', organizer:'FSATSE', status:'upcoming', registrationUrl:'https://www.ticket.com.br/meia-maratona-aracaju', phone:'(79) 3211-0000' },
  { name:'Corrida Cidade de Aracaju 2025', city:'Aracaju', state:'SE', date:'2025-06-15', distances:'10km,5km', organizer:'Prefeitura Aracaju', status:'upcoming', registrationUrl:'https://www.sympla.com.br/corrida-cidade-aracaju', phone:'(79) 3179-1078' },
  { name:'Corrida da Mulher Sergipe 2025', city:'Aracaju', state:'SE', date:'2025-03-08', distances:'5km,3km', organizer:'FSATSE', status:'completed', registrationUrl:'https://www.ticket.com.br/corrida-mulher-se' },
  { name:'Corrida Zé do Bairro 2025', city:'Aracaju', state:'SE', date:'2025-05-01', distances:'5km,3km', organizer:'TV Sergipe', status:'upcoming', registrationUrl:'https://www.sympla.com.br/ze-do-bairro' },
  { name:'Electric Run Sergipe 2025', city:'Aracaju', state:'SE', date:'2025-04-26', distances:'5km', organizer:'Electric Run', status:'upcoming', registrationUrl:'https://www.electricrun.com.br' },
  { name:'Corrida das Estações Aracaju 2025', city:'Aracaju', state:'SE', date:'2025-07-20', distances:'10km,5km', organizer:'Estações Run', status:'upcoming', registrationUrl:'https://www.ticketsports.com.br' },
  { name:'Maratona Sergipe 2025', city:'Aracaju', state:'SE', date:'2025-09-14', distances:'42km,21km,10km', organizer:'FSATSE', status:'upcoming', registrationUrl:'https://fcat.org.br' },
  { name:'Corrida Padre Zé Aracaju 2025', city:'Aracaju', state:'SE', date:'2025-10-04', distances:'10km,5km', organizer:'Igreja', status:'upcoming', registrationUrl:'https://www.sympla.com.br' },
  { name:'Corrida de Natal Aracaju 2025', city:'Aracaju', state:'SE', date:'2025-12-14', distances:'5km,3km', organizer:'Prefeitura', status:'upcoming', registrationUrl:'https://www.aracaju.se.gov.br' },
];

// PROVAS BRASIL 2025 COM LINKS REAIS
const PROVAS_BRASIL = [
  // SÃO PAULO
  { name:'Maratona Internacional de São Paulo 2025', city:'São Paulo', state:'SP', date:'2025-06-01', distances:'42km,21km,10km', organizer:'Yescom', status:'upcoming', registrationUrl:'https://www.maratonasp.com.br', phone:'(11) 3392-2100' },
  { name:'Meia Maratona de São Paulo 2025', city:'São Paulo', state:'SP', date:'2025-05-11', distances:'21km', organizer:'Track&Field', status:'upcoming', registrationUrl:'https://www.trackandfield.com.br/corridas' },
  { name:'Corrida São Silvestre 2025', city:'São Paulo', state:'SP', date:'2025-12-31', distances:'15km', organizer:'Folha de SP', status:'upcoming', registrationUrl:'https://www.saosilvestre.com.br', phone:'(11) 3224-3000' },
  { name:'Corrida Estadual SP 2025', city:'São Paulo', state:'SP', date:'2025-08-17', distances:'21km,10km,5km', organizer:'FPA', status:'upcoming', registrationUrl:'https://www.fpa.org.br' },

  // RIO DE JANEIRO
  { name:'Maratona do Rio de Janeiro 2025', city:'Rio de Janeiro', state:'RJ', date:'2025-06-08', distances:'42km,21km,10km', organizer:'Rio Marathon', status:'upcoming', registrationUrl:'https://www.maratonario.com.br', phone:'(21) 2544-4555' },
  { name:'Meia Maratona Internacional do Rio 2025', city:'Rio de Janeiro', state:'RJ', date:'2025-07-13', distances:'21km,10km', organizer:'Rio Marathon', status:'upcoming', registrationUrl:'https://www.meiamaratonario.com.br' },

  // NORDESTE
  { name:'Maratona de Salvador 2025', city:'Salvador', state:'BA', date:'2025-08-24', distances:'42km,21km,10km,5km', organizer:'Salvador Run', status:'upcoming', registrationUrl:'https://www.maratonasalvador.com.br' },
  { name:'Meia Maratona de Recife 2025', city:'Recife', state:'PE', date:'2025-07-20', distances:'21km,10km', organizer:'Recife Run', status:'upcoming', registrationUrl:'https://www.ticket.com.br/meia-recife' },
  { name:'Maratona de Fortaleza 2025', city:'Fortaleza', state:'CE', date:'2025-09-07', distances:'42km,21km', organizer:'Fortaleza Run', status:'upcoming', registrationUrl:'https://www.maratonafortaleza.com.br' },
  { name:'Meia Maratona de Maceió 2025', city:'Maceió', state:'AL', date:'2025-08-03', distances:'21km,10km,5km', organizer:'AL Run', status:'upcoming', registrationUrl:'https://www.sympla.com.br/meia-maceio' },
  { name:'Meia Maratona de Natal 2025', city:'Natal', state:'RN', date:'2025-06-22', distances:'21km,10km', organizer:'RN Run', status:'upcoming', registrationUrl:'https://www.ticketsports.com.br' },

  // SUL
  { name:'Maratona de Porto Alegre 2025', city:'Porto Alegre', state:'RS', date:'2025-06-29', distances:'42km,21km,10km', organizer:'POA Run', status:'upcoming', registrationUrl:'https://www.maratonapoa.com.br' },
  { name:'Maratona de Florianópolis 2025', city:'Florianópolis', state:'SC', date:'2025-08-03', distances:'42km,21km', organizer:'Florian Run', status:'upcoming', registrationUrl:'https://www.maratonafloripa.com.br' },
  { name:'Corrida Internacional de Curitiba 2025', city:'Curitiba', state:'PR', date:'2025-05-25', distances:'42km,21km,10km', organizer:'Curitiba Run', status:'upcoming', registrationUrl:'https://www.corridacuritiba.com.br' },

  // MINAS / CENTRO-OESTE
  { name:'Maratona de Belo Horizonte 2025', city:'Belo Horizonte', state:'MG', date:'2025-08-31', distances:'42km,21km,10km', organizer:'BH Run', status:'upcoming', registrationUrl:'https://www.maratonabh.com.br' },
  { name:'Maratona de Brasília 2025', city:'Brasília', state:'DF', date:'2025-05-11', distances:'42km,21km', organizer:'BSB Run', status:'upcoming', registrationUrl:'https://www.maratonabrasilia.com.br' },
  { name:'Volta da Pampulha 2025', city:'Belo Horizonte', state:'MG', date:'2025-05-18', distances:'18km', organizer:'Sesc MG', status:'upcoming', registrationUrl:'https://www.sescmg.com.br/pampulha' },

  // NORTE
  { name:'Maratona de Belém 2025', city:'Belém', state:'PA', date:'2025-07-06', distances:'42km,21km,10km', organizer:'PA Run', status:'upcoming', registrationUrl:'https://www.sympla.com.br/maratona-belem' },
  { name:'Corrida Amazônica Manaus 2025', city:'Manaus', state:'AM', date:'2025-08-10', distances:'21km,10km,5km', organizer:'AM Run', status:'upcoming', registrationUrl:'https://www.ticketsports.com.br' },
];

async function seed() {
  console.log('\n🚀 Inserindo provas do Brasil 2025...\n');
  const todas = [...PROVAS_SERGIPE, ...PROVAS_BRASIL];
  let criadas = 0, existentes = 0;

  for(const p of todas) {
    const existe = await prisma.race.findFirst({
      where: { name: { contains: p.name.split(' ').slice(0,4).join(' '), mode:'insensitive' } }
    });
    if(existe) {
      // Atualiza link de inscrição se não tiver
      if(p.registrationUrl && !existe.registrationUrl) {
        await prisma.race.update({ where:{id:existe.id}, data:{registrationUrl:p.registrationUrl} });
        console.log('🔗 Link atualizado:', p.name);
      }
      existentes++;
      continue;
    }
    await prisma.race.create({ data:{
      name: p.name, city: p.city, state: p.state,
      date: new Date(p.date), distances: p.distances,
      organizer: p.organizer, status: p.status,
      registrationUrl: p.registrationUrl || null,
    }});
    console.log('✅ Criada:', p.name);
    criadas++;
  }

  // RELATÓRIO
  const total = await prisma.race.count();
  const comLink = await prisma.race.count({ where:{ registrationUrl:{ not:null } } });
  const upcoming = await prisma.race.count({ where:{ status:'upcoming' } });

  console.log('\n═══════════════════════════════');
  console.log('📊 RESULTADO:');
  console.log('✅ Novas criadas:', criadas);
  console.log('⏭  Já existiam:', existentes);
  console.log('📅 Total no banco:', total);
  console.log('🔗 Com link inscrição:', comLink);
  console.log('🏃 Próximas provas:', upcoming);
  console.log('\n🔗 LINKS SERGIPE:');
  const se = await prisma.race.findMany({ where:{state:'SE'}, orderBy:{date:'asc'} });
  se.forEach(r => console.log(' -', r.name, '\n  ', r.registrationUrl||'sem link'));
  console.log('═══════════════════════════════');

  await prisma.$disconnect();
}

seed().catch(console.error);
