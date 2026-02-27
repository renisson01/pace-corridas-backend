import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CORRIDAS_SE_2026 = [
  // MARÇO
  { name:'Tropical Run 2026', city:'Aracaju', state:'SE', date:'2026-03-01', distances:'2,5km,5km,10km', organizer:'Speed Produções (Rodrigo Tuchê)', phone:'(79)991430442', status:'upcoming', registrationUrl:null },
  { name:'Circuito Zodíaco Quero Delivery - Etapa Água 2026', city:'Lagarto', state:'SE', date:'2026-03-01', distances:'2,5km,5km,10km', organizer:'Boston Running (Caio Rangel)', phone:'(79)999204559', status:'upcoming', registrationUrl:null },
  { name:'Circuito Corridas Verão Sergipe - Etapa Abaís 2026', city:'Estância', state:'SE', date:'2026-03-01', distances:'5km', organizer:'Gov. Sergipe/SEEL', phone:'(79)999209131', status:'upcoming', registrationUrl:null },
  { name:'Corrida Rústica 191 Anos PMSE 2026', city:'Aracaju', state:'SE', date:'2026-03-07', distances:'2,5km,5km', organizer:'Polícia Militar (Cel. Rollemberg)', phone:'(79)999567004', status:'upcoming', registrationUrl:null },
  { name:'Arena Run 1a. Edição 2026', city:'Poço Verde', state:'SE', date:'2026-03-08', distances:'3km,6km', organizer:'Academia Arena Fit (Gleidson/Mariza)', phone:'(79)998091406', status:'upcoming', registrationUrl:null },
  { name:'Circuito Semedi Corrida de Rua - Etapa Lagarto 2026', city:'Lagarto', state:'SE', date:'2026-03-08', distances:'3km,5km,10km', organizer:'RC Produções (Rodrigo Cruz)', phone:'(79)999903279', status:'upcoming', registrationUrl:'https://leveyourun.com/evt/circuito-semedi-de-corrida-derua-2026-dc4' },
  { name:'1a. Corrida Conexão Feminina 2026', city:'Barra dos Coqueiros', state:'SE', date:'2026-03-08', distances:'2,5km', organizer:'Pref. Barra dos Coqueiros', phone:'(22)999322722', status:'upcoming', registrationUrl:null },
  { name:'Corrida Vem com Nhara 2026', city:'Umbaúba', state:'SE', date:'2026-03-08', distances:'3km,5km', organizer:'Academia Fontes (Thaynara)', phone:'(79)999467305', status:'upcoming', registrationUrl:null },
  { name:'Corrida do Peixe-Boi 2026', city:'Aracaju', state:'SE', date:'2026-03-14', distances:'2,5km,5km', organizer:'Fundação Mamíferos Aquáticos', phone:'(79)981341776', status:'upcoming', registrationUrl:null },
  { name:'Night Run Pithon Suplementos 2026', city:'Nossa Senhora da Glória', state:'SE', date:'2026-03-14', distances:'3km,5km', organizer:'Pithon Suplementos (Marcos)', phone:'(79)999121888', status:'upcoming', registrationUrl:null },
  { name:'1a. Corrida da Polícia Penal 2026', city:'Aracaju', state:'SE', date:'2026-03-15', distances:'3km,5km,10km', organizer:'RC Produções (Rodrigo Cruz)', phone:'(79)999903279', status:'upcoming', registrationUrl:'https://leveyourun.com/evt/1-corrida-da-policia-penal-desergipe-20-8kr' },
  { name:'1a. Tobias Master Run 2026', city:'Tobias Barreto', state:'SE', date:'2026-03-15', distances:'3,5km,7km', organizer:'Boston Running (Caio Rangel)', phone:'(79)999204559', status:'upcoming', registrationUrl:null },
  { name:'1a. Corrida São José Servo Fiel 2026', city:'Pinhão', state:'SE', date:'2026-03-15', distances:'5km', organizer:'Paróquia São José', phone:'(79)998744807', status:'upcoming', registrationUrl:null },
  { name:'5a. Corrida da Luz 2026', city:'Lagarto', state:'SE', date:'2026-03-21', distances:'3km,5km,10km', organizer:'RC Produções (Rodrigo Cruz)', phone:'(79)999903279', status:'upcoming', registrationUrl:null },
  { name:'Play Night Run 2026', city:'Canindé de São Francisco', state:'SE', date:'2026-03-21', distances:'4km,8km', organizer:'Loja Play Sports (Welder)', phone:'(82)988138582', status:'upcoming', registrationUrl:null },
  { name:'6a. Corrida da AACC 2026', city:'Campo do Brito', state:'SE', date:'2026-03-22', distances:'2,5km,5km', organizer:'AACC (Gilenaldo Gois)', phone:'(79)996616584', status:'upcoming', registrationUrl:null },
  { name:'Corrida Cidade de Aracaju 2026', city:'São Cristóvão', state:'SE', date:'2026-03-28', distances:'5km,10km,24km', organizer:'Pref. Aracaju/SEJESP', phone:'(79)998268977', status:'upcoming', registrationUrl:null },

  // ABRIL
  { name:'Corrida 100% Luande FM 2026', city:'Tobias Barreto', state:'SE', date:'2026-04-05', distances:'4km,8km', organizer:'Boston Running (Caio Rangel)', phone:'(79)999204559', status:'upcoming', registrationUrl:'https://www.sportschrono.com.br/evento/2026/corrida-derua/10-corrida-dos-amigos-de-porto-da-folha' },
  { name:'10a. Corrida dos Amigos 2026', city:'Porto da Folha', state:'SE', date:'2026-04-05', distances:'5km', organizer:'MM Informática (João/Osmar)', phone:'(79)998190780', status:'upcoming', registrationUrl:'https://www.sportschrono.com.br/evento/2026/corrida-de-rua/10-corrida-dos-amigos-de-porto-da-folha' },
  { name:'Sunset Run 2026', city:'Aracaju', state:'SE', date:'2026-04-11', distances:'2,5km,5km,10km', organizer:'Speed Produções (Rodrigo Tuchê)', phone:'(79)991430442', status:'upcoming', registrationUrl:null },
  { name:'Corrida Bob Esponja 2026', city:'Aracaju', state:'SE', date:'2026-04-12', distances:'2,5km,5km,10km', organizer:'Conceito Soluções (Flávia Luana)', phone:'(79)999815955', status:'upcoming', registrationUrl:null },
  { name:'Cactos Run 2026', city:'Canindé do São Francisco', state:'SE', date:'2026-04-12', distances:'6km,7km,10km', organizer:'Sertão Gelato (Marcelo/Marcondes)', phone:'(79)988727374', status:'upcoming', registrationUrl:'https://www.chipower.com.br/evento/2026/corrida-derua/cactos-run-2026' },
  { name:'We Can Run 1a. Etapa 2026', city:'Aracaju', state:'SE', date:'2026-04-12', distances:'2,5km,5km,10km', organizer:'Conceito Soluções (Flávia Luana)', phone:'(79)999815955', status:'upcoming', registrationUrl:null },
  { name:'Corrida Trail Verão 2026', city:'Aracaju', state:'SE', date:'2026-04-12', distances:'5km,8km', organizer:'Síndicas Sergipe Brasil', phone:'(79)988281283', status:'upcoming', registrationUrl:'https://leveyourun.com/evt/circuito-de-corrida-sindicas-desergipe-il4' },
  { name:'Atena Night Run 2026', city:'Itabaiana', state:'SE', date:'2026-04-18', distances:'3km,5km,10km', organizer:'Atena Proteção/Oliver Run', phone:'(79)981254958', status:'upcoming', registrationUrl:null },
  { name:'Corrida Corre Cristão 2026', city:'Aracaju', state:'SE', date:'2026-04-19', distances:'2,5km,5km', organizer:'Confins Produções', phone:'(79)988164083', status:'upcoming', registrationUrl:'https://www.centraldasinscricoes.com.br/evento/corrida-corre-cristao-aracaju' },
  { name:'2a. Corrida da Nossa Gente 2026', city:'Japaratuba', state:'SE', date:'2026-04-19', distances:'3km,6km', organizer:'Pref. Japaratuba', phone:'(79)999832847', status:'upcoming', registrationUrl:null },
  { name:'Circuito Corridas TV Atalaia 1a. Etapa 2026', city:'Aracaju', state:'SE', date:'2026-04-25', distances:'2,5km,5km,10km', organizer:'TV Atalaia/Speed Produções', phone:'(79)991430442', status:'upcoming', registrationUrl:null },

  // MAIO
  { name:'Corrida Nacional do SESI 2026', city:'Aracaju', state:'SE', date:'2026-05-01', distances:'3km,5km,10km', organizer:'SESI/Speed Produções', phone:'(79)991430442', status:'upcoming', registrationUrl:null },
  { name:'Corrida do Trabalhador Itaporanga 2026', city:'Itaporanga d\'Ajuda', state:'SE', date:'2026-05-01', distances:'6km', organizer:'Pref. Itaporanga', phone:'(79)992890452', status:'upcoming', registrationUrl:null },
  { name:'Corrida Cidade Jardim 4a. Edição 2026', city:'Estância', state:'SE', date:'2026-05-01', distances:'3km,5km,10km', organizer:'Pref. Estância/SEJUDE', phone:'(79)999659697', status:'upcoming', registrationUrl:null },
  { name:'Corrida Eu Amo Pedra Mole 2026', city:'Pedra Mole', state:'SE', date:'2026-05-03', distances:'5km,7km', organizer:'DJ Marketing (Sandro/Márcio)', phone:'(79)999731015', status:'upcoming', registrationUrl:null },
  { name:'1a. Corrida Cidade Mãe 2026', city:'São Cristóvão', state:'SE', date:'2026-05-03', distances:'5km,15km', organizer:'Pref. São Cristóvão', phone:'(79)999864361', status:'upcoming', registrationUrl:null },
  { name:'Track & Field Run Series Aracaju I 2026', city:'Aracaju', state:'SE', date:'2026-05-09', distances:'5km,10km,21km', organizer:'TFSports (Peterson Cabeça)', phone:'(11)942085985', status:'upcoming', registrationUrl:null },
  { name:'Maratá Night Race Aracaju 2026', city:'Aracaju', state:'SE', date:'2026-05-23', distances:'2,5km,5km,10km,15km', organizer:'Speed Produções (Rodrigo Tuchê)', phone:'(79)991430442', status:'upcoming', registrationUrl:null },
  { name:'1o. Desafio da Caatinga PMSE 2026', city:'Nossa Senhora da Glória', state:'SE', date:'2026-05-23', distances:'3km,8km', organizer:'BPCAATINGA PMSE', phone:'(79)998460707', status:'upcoming', registrationUrl:null },
  { name:'1a. Corrida da Comunicação Sergipana 2026', city:'Aracaju', state:'SE', date:'2026-05-30', distances:'2x2,5km', organizer:'SEJESP', phone:'(79)999724202', status:'upcoming', registrationUrl:null },
  { name:'1a. Corrida Academia Espaço Fitness 2026', city:'Telha', state:'SE', date:'2026-05-31', distances:'5km', organizer:'Academia Espaço Fitness', phone:'(79)998506404', status:'upcoming', registrationUrl:'https://inscricoes.com.br/eventos/1a-corrida-da-academia-espaco-fitness' },
  { name:'V Corrida Rústica Riachão do Dantas 2026', city:'Riachão do Dantas', state:'SE', date:'2026-05-31', distances:'5km,10km', organizer:'Pref. Riachão/Esporte e Lazer', phone:'(79)999051515', status:'upcoming', registrationUrl:null },

  // JUNHO
  { name:'Corrida dos Namorados Revezamento 2026', city:'Itabaiana', state:'SE', date:'2026-06-06', distances:'2x5km,2x10km', organizer:'Federação Sergipana Atletismo', phone:null, status:'upcoming', registrationUrl:null },
  { name:'Corrida da Colina do Santo Antônio 2026', city:'Aracaju', state:'SE', date:'2026-06-07', distances:'5km,10km', organizer:'Conceito Soluções (Flávia Luana)', phone:'(79)999815955', status:'upcoming', registrationUrl:'https://centraldacorrida.com.br/evento/colina26' },
  { name:'Corrida Batalha Naval de Riachuelo 2026', city:'Riachuelo', state:'SE', date:'2026-06-07', distances:'3km,5km,10km', organizer:'Sec. Juventude Esporte Lazer', phone:'(71)999043141', status:'upcoming', registrationUrl:null },
  { name:'Corrida Volta do Canarinho 2026', city:'Estância', state:'SE', date:'2026-06-13', distances:'5km,10km', organizer:'Estanciano Sport Club', phone:'(79)998226922', status:'upcoming', registrationUrl:'https://www.sportschrono.com.br/eventos' },
  { name:'Corrida do Milhão Edição 2026', city:'Aracaju', state:'SE', date:'2026-06-21', distances:'5km,10km', organizer:'Federação Sergipana Atletismo', phone:null, status:'upcoming', registrationUrl:null },

  // JULHO
  { name:'Corrida do Fogo 2026', city:'Aracaju', state:'SE', date:'2026-07-04', distances:'2,5km,5km,10km', organizer:'Corpo de Bombeiros', phone:'(79)999480812', status:'upcoming', registrationUrl:null },
  { name:'Smurfs Run 2026', city:'Aracaju', state:'SE', date:'2026-07-05', distances:'5km', organizer:'JF Sports (Anderson Langares)', phone:'(11)940564145', status:'upcoming', registrationUrl:null },
  { name:'Corrida 100% Você Etapa Aracaju 2026', city:'Aracaju', state:'SE', date:'2026-07-08', distances:'5km,10km', organizer:'Conceito Soluções (Flávia Luana)', phone:'(79)999815955', status:'upcoming', registrationUrl:null },
  { name:'Itabaiana Night Race 2026', city:'Itabaiana', state:'SE', date:'2026-07-19', distances:'2,5km,5km,10km', organizer:'Speed Produções (Rodrigo Tuchê)', phone:'(79)991430442', status:'upcoming', registrationUrl:null },
  { name:'Circuito SESC Corridas Etapa Tobias Barreto 2026', city:'Tobias Barreto', state:'SE', date:'2026-07-19', distances:'2,5km,5km,10km', organizer:'SESC (Osean/Thiago)', phone:'(79)999533032', status:'upcoming', registrationUrl:null },
  { name:'Meia Maratona do Parque 2026', city:'Aracaju', state:'SE', date:'2026-07-26', distances:'3km,5km,10km,21km', organizer:'Go Bravos (Lucas José)', phone:'(79)991582099', status:'upcoming', registrationUrl:'https://centraldacorrida.com.br/evento/meiadoparque2026' },

  // AGOSTO
  { name:'Aracaju 21K Etapa Caju 2026', city:'Aracaju', state:'SE', date:'2026-08-01', distances:'5km,10km,15km,21km', organizer:'Federação Sergipana Atletismo', phone:null, status:'upcoming', registrationUrl:null },
  { name:'3a. Corrida Mais Milhas 2026', city:'Malhador', state:'SE', date:'2026-08-02', distances:'3km,5km', organizer:'Clube Mais Milhas (Elton)', phone:'(79)999296603', status:'upcoming', registrationUrl:null },
  { name:'14a. Corrida da Advocacia 2026', city:'Aracaju', state:'SE', date:'2026-08-02', distances:'2,5km,5km,10km', organizer:'OAB-SE/Speed Produções', phone:'(79)991430442', status:'upcoming', registrationUrl:null },
  { name:'1o. Corre IEAD 2026', city:'Aracaju', state:'SE', date:'2026-08-09', distances:'2,5km,5km', organizer:'Igreja Assembléia de Deus/Kenya Run', phone:'(79)999895124', status:'upcoming', registrationUrl:null },
  { name:'Corrida Duque de Caxias 2026', city:'Aracaju', state:'SE', date:'2026-08-15', distances:'2,5km,5km,10km', organizer:'28o. BC', phone:'(32)991557612', status:'upcoming', registrationUrl:null },
  { name:'7a. Corrida 11o. Batalhão Tobias Barreto 2026', city:'Tobias Barreto', state:'SE', date:'2026-08-15', distances:'4km,10km', organizer:'11o. BPM', phone:'(79)999761007', status:'upcoming', registrationUrl:null },
  { name:'Circuito Corridas TV Atalaia 3a. Etapa 2026', city:'Aracaju', state:'SE', date:'2026-08-22', distances:'2,5km,5km,10km', organizer:'TV Atalaia/Speed Produções', phone:'(79)991430442', status:'upcoming', registrationUrl:null },
  { name:'Corrida da Amizade 10a. Edição 2026', city:'Nossa Senhora da Glória', state:'SE', date:'2026-08-22', distances:'3km,5km,10km', organizer:'Nunes Peixoto (Simone)', phone:'(79)996442104', status:'upcoming', registrationUrl:null },
  { name:'Ultramaratona de Sergipe 1a. Etapa 2026', city:'Estância', state:'SE', date:'2026-08-29', distances:'100km', organizer:'Projeto Seja Ultra (Farley)', phone:'(79)999945072', status:'upcoming', registrationUrl:null },
  { name:'Desafio Seja Ultra 1a. Etapa 2026', city:'Aracaju', state:'SE', date:'2026-08-29', distances:'25km', organizer:'Projeto Seja Ultra (Farley)', phone:'(79)999945072', status:'upcoming', registrationUrl:null },
  { name:'Desafio Seja Ultra 2a. Etapa 2026', city:'Barra dos Coqueiros', state:'SE', date:'2026-08-30', distances:'6km,12km', organizer:'Projeto Seja Ultra (Farley)', phone:'(79)999945072', status:'upcoming', registrationUrl:null },

  // SETEMBRO
  { name:'2a. Corrida Solidária SAME/IJBC 2026', city:'Aracaju', state:'SE', date:'2026-09-05', distances:'2,5km,5km,10km', organizer:'Instituto Judô Boto Cinza/Go Bravos', phone:'(79)991582099', status:'upcoming', registrationUrl:null },
  { name:'Ilha Run 2026', city:'Ilha das Flores', state:'SE', date:'2026-09-05', distances:'2,5km,5km', organizer:'Agro Soluções (Bruno Jesus)', phone:'(79)998677740', status:'upcoming', registrationUrl:null },
  { name:'Circuito SESC Corridas Etapa Aracaju 2026', city:'Aracaju', state:'SE', date:'2026-09-06', distances:'2,5km,5km,10km', organizer:'SESC (Osean/Thiago)', phone:'(79)999533032', status:'upcoming', registrationUrl:null },
  { name:'Lagarto Night Race 2026', city:'Lagarto', state:'SE', date:'2026-09-13', distances:'2,5km,5km,10km', organizer:'Speed Produções (Rodrigo Tuchê)', phone:'(79)991430442', status:'upcoming', registrationUrl:null },
  { name:'OliverNight 2026', city:'Itabaiana', state:'SE', date:'2026-09-14', distances:'3km,5km', organizer:'OliverRun (Renê Santana)', phone:'(79)999287066', status:'upcoming', registrationUrl:null },
  { name:'Santander Track & Field Run Series Aracaju II 2026', city:'Aracaju', state:'SE', date:'2026-09-20', distances:'5km,10km,15km', organizer:'TFSports (Peterson Cabeça)', phone:'(11)942085985', status:'upcoming', registrationUrl:null },
  { name:'Velho Chico Run 2026', city:'Propriá', state:'SE', date:'2026-09-21', distances:'2,5km,5km,10km', organizer:'Fitplan Assessoria (Thayslane)', phone:'(79)999611571', status:'upcoming', registrationUrl:null },
  { name:'Corrida do Milhão - Maratona Aracaju 1a. Etapa 2026', city:'Aracaju', state:'SE', date:'2026-09-23', distances:'10km,21km', organizer:'Speed Produções (Rodrigo Tuchê)', phone:'(79)991430442', status:'upcoming', registrationUrl:null },

  // OUTUBRO
  { name:'Corrida ZÉ DO BAIRRO 8a. Edição 2026', city:'Aracaju', state:'SE', date:'2026-10-04', distances:'2,5km,5km,10km,15km', organizer:'Speed Produções (Rodrigo Tuchê)', phone:'(79)991430442', status:'upcoming', registrationUrl:null },
  { name:'Corrida Feminina Divas Flash Back 2026', city:'Aracaju', state:'SE', date:'2026-10-04', distances:'2,5km,5km', organizer:'Conceito Soluções (Flávia Luana)', phone:'(79)999815955', status:'upcoming', registrationUrl:'https://centraldacorrida.com.br/evento/divas26' },
  { name:'12a. Corrida Outubro Rosa Sergipe 2026', city:'Aracaju', state:'SE', date:'2026-10-17', distances:'A definir', organizer:'AMO/Conceito Soluções', phone:'(79)999815955', status:'upcoming', registrationUrl:null },
  { name:'Circuito Corridas Caixa Etapa Aracaju 2026', city:'Aracaju', state:'SE', date:'2026-10-18', distances:'5km,10km', organizer:'HT Sports (Hélio Takai)', phone:'(11)999743340', status:'upcoming', registrationUrl:null },
  { name:'Maratona de Aracaju 1a. Etapa 2026', city:'Aracaju', state:'SE', date:'2026-10-25', distances:'10km,21km', organizer:'Speed Produções (Rodrigo Tuchê)', phone:'(79)991430442', status:'upcoming', registrationUrl:null },

  // NOVEMBRO
  { name:'Maratona de Aracaju 2a. Etapa 2026', city:'Aracaju', state:'SE', date:'2026-11-01', distances:'5km,42km', organizer:'Speed Produções (Rodrigo Tuchê)', phone:'(79)991430442', status:'upcoming', registrationUrl:null },
  { name:'3a. Corrida Beneficente Santa Dulce dos Pobres 2026', city:'Itabaiana', state:'SE', date:'2026-11-07', distances:'3km,5km,10km', organizer:'Oratório Santa Dulce', phone:'(79)996792770', status:'upcoming', registrationUrl:null },
  { name:'Corrida dos Servidores Sergipe 2026', city:'Aracaju', state:'SE', date:'2026-11-14', distances:'2,5km,5km,10km,15km', organizer:'Gov. Sergipe/SEAD', phone:'(79)991351033', status:'upcoming', registrationUrl:null },
  { name:'3a. Corrida da Fé 2026', city:'Aracaju', state:'SE', date:'2026-11-21', distances:'2,5km,4km', organizer:'Igreja Quadrangular', phone:'(79)996331311', status:'upcoming', registrationUrl:null },
  { name:'Electric Run 2026', city:'Aracaju', state:'SE', date:'2026-11-21', distances:'2,5km,5km,10km', organizer:'Speed Produções (Rodrigo Tuchê)', phone:'(79)991430442', status:'upcoming', registrationUrl:null },

  // DEZEMBRO
  { name:'Meia da Conceição 2026', city:'Aracaju', state:'SE', date:'2026-12-06', distances:'3km,6km,13km,21km', organizer:'Conceito Soluções (Flávia Luana)', phone:'(79)999815955', status:'upcoming', registrationUrl:'https://centraldacorrida.com.br/evento/conceicao2026' },
  { name:'Corrida da Virada Neópolis 2026', city:'Neópolis', state:'SE', date:'2026-12-20', distances:'5km,10km', organizer:'Equipe Supere-Se (Vinicius)', phone:'(79)998288598', status:'upcoming', registrationUrl:null },
];

async function seed() {
  console.log('\n🚀 Inserindo calendário oficial FSAt 2026 - Sergipe\n');
  let criadas = 0, atualizadas = 0, skip = 0;

  for(const p of CORRIDAS_SE_2026) {
    const existe = await prisma.race.findFirst({
      where:{ name:{ contains: p.name.split(' ').slice(0,5).join(' '), mode:'insensitive' } }
    });

    if(existe) {
      // Atualiza link e telefone se tiver
      const updates = {};
      if(p.registrationUrl && !existe.registrationUrl) updates.registrationUrl = p.registrationUrl;
      if(Object.keys(updates).length > 0) {
        await prisma.race.update({ where:{id:existe.id}, data:updates });
        atualizadas++;
        console.log('🔗 Atualizado:', p.name);
      } else {
        skip++;
      }
      continue;
    }

    await prisma.race.create({ data:{
      name:p.name, city:p.city, state:p.state,
      date:new Date(p.date), distances:p.distances,
      organizer:p.organizer, status:p.status,
      registrationUrl:p.registrationUrl||null,
    }});
    console.log('✅', p.date.substring(5), p.name);
    criadas++;
  }

  const total = await prisma.race.count();
  const se2026 = await prisma.race.count({ where:{ state:'SE', date:{ gte:new Date('2026-01-01') } } });
  const comLink = await prisma.race.count({ where:{ state:'SE', registrationUrl:{ not:null } } });

  console.log('\n════════════════════════════════════════');
  console.log('📊 RESULTADO:');
  console.log('✅ Novas criadas:', criadas);
  console.log('🔗 Atualizadas com link:', atualizadas);
  console.log('⏭  Já existiam:', skip);
  console.log('🏃 Total Sergipe 2026:', se2026);
  console.log('🔗 Com link inscrição:', comLink);
  console.log('📅 Total geral banco:', total);
  console.log('\n🔗 Links disponíveis Sergipe:');
  const comLinkList = await prisma.race.findMany({
    where:{ state:'SE', registrationUrl:{not:null} },
    select:{ name:true, registrationUrl:true, date:true }
  });
  comLinkList.forEach(r => console.log(' -', new Date(r.date).toLocaleDateString('pt-BR'), r.name, '\n  ', r.registrationUrl));
  console.log('════════════════════════════════════════');
  await prisma.$disconnect();
}

seed().catch(console.error);
