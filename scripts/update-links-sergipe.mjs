import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Links mapeados com info extraída da URL
const LINKS = [
  {
    url: 'https://www.sportschrono.com.br/evento/2026/corrida-de-rua/6-corrida-da-aacc',
    nome: '6a. Corrida da AACC 2026', busca: 'AACC', cidade: 'Campo do Brito', estado: 'SE',
    distancias: '5km', data: '2026-03-22'
  },
  {
    url: 'https://www.sportschrono.com.br/evento/2026/corrida-de-rua/4-corrida-solidaria-do-3-batalhao-da-pmse',
    nome: '4a. Corrida Solidária 3º Batalhão PMSE 2026', busca: 'Batalhão PMSE', cidade: 'Aracaju', estado: 'SE',
    distancias: '5km,10km', data: '2026-04-05'
  },
  {
    url: 'https://www.sportschrono.com.br/evento/2026/corrida-de-rua/night-run-pithon-suplementos',
    nome: 'Night Run Pithon Suplementos 2026', busca: 'Pithon', cidade: 'Nossa Senhora da Glória', estado: 'SE',
    distancias: '3km,5km', data: '2026-03-14'
  },
  {
    url: 'https://www.sportschrono.com.br/evento/2026/corrida-de-rua/10-corrida-dos-amigos-de-porto-da-folha',
    nome: '10a. Corrida dos Amigos Porto da Folha 2026', busca: 'Porto da Folha', cidade: 'Porto da Folha', estado: 'SE',
    distancias: '5km', data: '2026-04-05'
  },
  {
    url: 'https://www.sportschrono.com.br/evento/2026/corrida-de-rua/atena-night-run',
    nome: 'Atena Night Run 2026', busca: 'Atena Night', cidade: 'Itabaiana', estado: 'SE',
    distancias: '3km,5km,10km', data: '2026-04-18'
  },
  {
    url: 'https://www.sportschrono.com.br/evento/2026/corrida-de-rua/1-corrida-primefit-edicao-2026',
    nome: '1a. Corrida PrimeFit 2026', busca: 'PrimeFit', cidade: 'Aracaju', estado: 'SE',
    distancias: '5km,10km', data: '2026-05-10'
  },
  {
    url: 'https://www.sportschrono.com.br/evento/2026/corrida-de-rua/treinao-centro-espirita-caminho-da-luz',
    nome: 'Treinão Centro Espírita Caminho da Luz 2026', busca: 'Caminho da Luz', cidade: 'Aracaju', estado: 'SE',
    distancias: '5km', data: '2026-04-26'
  },
  {
    url: 'https://www.sportschrono.com.br/evento/2026/corrida-de-rua/1-corrida-eu-amo-pedra-mole',
    nome: '1a. Corrida Eu Amo Pedra Mole 2026', busca: 'Pedra Mole', cidade: 'Pedra Mole', estado: 'SE',
    distancias: '5km,7km', data: '2026-05-03'
  },
  {
    url: 'https://www.sportschrono.com.br/evento/2026/corrida-de-rua/1-desafio-da-caatinga',
    nome: '1o. Desafio da Caatinga PMSE 2026', busca: 'Caatinga PMSE', cidade: 'Nossa Senhora da Glória', estado: 'SE',
    distancias: '3km,8km', data: '2026-05-23'
  },
  {
    url: 'https://www.sportschrono.com.br/evento/2026/corrida-de-rua/2-edicao-corrida-corre-korpus',
    nome: '2a. Corrida Corre Korpus 2026', busca: 'Korpus', cidade: 'Aracaju', estado: 'SE',
    distancias: '5km,10km', data: '2026-05-17'
  },
  {
    url: 'https://www.sportschrono.com.br/evento/2026/corrida-de-rua/viii-corrida-academia-power-fitness',
    nome: 'VIII Corrida Academia Power Fitness 2026', busca: 'Power Fitness', cidade: 'Aracaju', estado: 'SE',
    distancias: '5km,10km', data: '2026-06-14'
  },
  {
    url: 'https://www.chipower.com.br/evento/2026/trail-run/desafio-dos-falces-2026',
    nome: 'Desafio dos Falces 2026', busca: 'Falces', cidade: 'Poço Redondo', estado: 'SE',
    distancias: '10km,20km', data: '2026-06-07'
  },
  {
    url: 'https://www.chipower.com.br/evento/2026/corrida-de-rua/xingo-trail-run-2026',
    nome: 'Xingó Trail Run 2026', busca: 'Xingó', cidade: 'Canindé de São Francisco', estado: 'SE',
    distancias: '10km,21km', data: '2026-07-05'
  },
  {
    url: 'https://inscricoes.com.br/eventos/projeto-kadu',
    nome: 'Projeto Kadu 2026', busca: 'Kadu', cidade: 'Aracaju', estado: 'SE',
    distancias: '5km', data: '2026-04-19'
  },
  {
    url: 'https://leveyourun.com/evt/circuito-semedi-de-corrida-de-rua-2026-dc4',
    nome: 'Circuito Semedi Corrida de Rua 2026', busca: 'Semedi', cidade: 'Lagarto', estado: 'SE',
    distancias: '3km,5km,10km', data: '2026-03-08'
  },
  {
    url: 'https://leveyourun.com/evt/1-corrida-da-policia-penal-de-sergipe-20-8kr',
    nome: '1a. Corrida da Polícia Penal de Sergipe 2026', busca: 'Polícia Penal', cidade: 'Aracaju', estado: 'SE',
    distancias: '3km,5km,10km', data: '2026-03-15'
  },
  {
    url: 'https://leveyourun.com/evt/projeto-cg-3dt',
    nome: 'Projeto CG 2026', busca: 'Projeto CG', cidade: 'Aracaju', estado: 'SE',
    distancias: '5km', data: '2026-04-12'
  },
  {
    url: 'https://leveyourun.com/evt/5-edicao-da-corrida-da-luz-2026-du4',
    nome: '5a. Corrida da Luz 2026', busca: 'Corrida da Luz', cidade: 'Lagarto', estado: 'SE',
    distancias: '3km,5km,10km', data: '2026-03-21'
  },
  {
    url: 'https://leveyourun.com/evt/pascoa-da-tindolala-wed',
    nome: 'Corrida Páscoa da Tindolala 2026', busca: 'Tindolala', cidade: 'Aracaju', estado: 'SE',
    distancias: '5km,10km', data: '2026-04-19'
  },
  {
    url: 'https://leveyourun.com/evt/1-corrida-movidos-pela-fe-9j2',
    nome: '1a. Corrida Movidos pela Fé 2026', busca: 'Movidos pela Fé', cidade: 'Aracaju', estado: 'SE',
    distancias: '5km', data: '2026-05-01'
  },
  {
    url: 'https://leveyourun.com/evt/ab-runners-2026-wzs',
    nome: 'AB Runners 2026', busca: 'AB Runners', cidade: 'Aracaju', estado: 'SE',
    distancias: '5km,10km', data: '2026-05-24'
  },
  {
    url: 'https://leveyourun.com/evt/1-treinao-do-domingao-qgp',
    nome: '1o. Treinão do Domingão 2026', busca: 'Treinão Domingão', cidade: 'Aracaju', estado: 'SE',
    distancias: '5km,10km', data: '2026-05-10'
  },
  {
    url: 'https://leveyourun.com/evt/circuito-de-corrida-sindicas-de-sergipe-il4',
    nome: 'Circuito Corrida Síndicas de Sergipe 2026', busca: 'Síndicas', cidade: 'Aracaju', estado: 'SE',
    distancias: '5km,8km', data: '2026-04-12'
  },
  {
    url: 'https://leveyourun.com/evt/3-corrida-mais-milhas-2026-bgr',
    nome: '3a. Corrida Mais Milhas 2026', busca: 'Mais Milhas', cidade: 'Aracaju', estado: 'SE',
    distancias: '5km,10km', data: '2026-06-21'
  },
];

async function run() {
  console.log('🔗 Atualizando links de inscrição...\n');
  let atualizados = 0, criados = 0;

  for (const link of LINKS) {
    // Buscar corrida existente por nome similar
    const palavras = link.busca.split(' ').filter(p => p.length > 3);
    let corrida = null;

    for (const palavra of palavras) {
      corrida = await prisma.race.findFirst({
        where: {
          name: { contains: palavra, mode: 'insensitive' },
          state: link.estado
        }
      });
      if (corrida) break;
    }

    if (corrida) {
      // Atualizar link de inscrição
      await prisma.race.update({
        where: { id: corrida.id },
        data: { registrationUrl: link.url }
      });
      console.log(`✅ Link atualizado: ${corrida.name}`);
      atualizados++;
    } else {
      // Criar corrida nova
      await prisma.race.create({
        data: {
          name: link.nome,
          city: link.cidade,
          state: link.estado,
          date: new Date(link.data),
          distances: link.distancias,
          organizer: 'SportsChrono/LeveYouRun',
          status: 'upcoming',
          registrationUrl: link.url,
        }
      });
      console.log(`🆕 Criada: ${link.nome}`);
      criados++;
    }
  }

  const comLink = await prisma.race.count({ where: { registrationUrl: { not: null } } });
  console.log(`\n✅ Atualizados: ${atualizados} | Criados: ${criados}`);
  console.log(`🔗 Total com link de inscrição: ${comLink}`);
  await prisma.$disconnect();
}

run().catch(console.error);
