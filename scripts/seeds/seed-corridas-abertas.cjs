const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function seed() {
  console.log('Populando Corridas Abertas');
  const corridas = [
    { nome:'Corrida Cidade de Aracaju 2026', data:new Date('2026-04-12'), cidade:'Aracaju', estado:'SE', distancias:'5km, 10km, 21km', linkInscricao:'https://www.ticketsports.com.br', preco:89.90, organizador:'FSAt', fonte:'manual' },
    { nome:'Night Run Itabaiana 2026', data:new Date('2026-04-26'), cidade:'Itabaiana', estado:'SE', distancias:'5km, 10km', linkInscricao:'https://www.ticketsports.com.br', preco:69.90, organizador:'PACE BRAZIL', fonte:'manual' },
    { nome:'Meia Maratona de Salvador', data:new Date('2026-05-10'), cidade:'Salvador', estado:'BA', distancias:'5km, 10km, 21km', linkInscricao:'https://www.ticketsports.com.br', preco:129.90, organizador:'FBA', fonte:'manual' },
    { nome:'Corrida do Trabalhador Maceio', data:new Date('2026-05-01'), cidade:'Maceio', estado:'AL', distancias:'5km, 10km', linkInscricao:'https://www.ticketsports.com.br', preco:59.90, organizador:'FAAt', fonte:'manual' },
    { nome:'Maratona de Recife 2026', data:new Date('2026-06-07'), cidade:'Recife', estado:'PE', distancias:'5km, 10km, 21km, 42km', linkInscricao:'https://www.ticketsports.com.br', preco:149.90, organizador:'FAP', fonte:'manual' },
    { nome:'Sergipe Trail Run', data:new Date('2026-05-17'), cidade:'Itabaiana', estado:'SE', distancias:'8km, 16km', linkInscricao:'https://www.sympla.com.br', preco:99.90, organizador:'Trail SE', fonte:'manual' },
    { nome:'Circuito Nordeste Aracaju', data:new Date('2026-06-21'), cidade:'Aracaju', estado:'SE', distancias:'5km, 10km, 21km', linkInscricao:'https://www.corridasonline.com.br', preco:109.90, organizador:'Circuito NE', fonte:'manual' },
    { nome:'Corrida do Forro Campina Grande', data:new Date('2026-06-14'), cidade:'Campina Grande', estado:'PB', distancias:'5km, 10km', linkInscricao:'https://www.ticketsports.com.br', preco:79.90, organizador:'FPbAt', fonte:'manual' },
    { nome:'Sao Joao Run Caruaru', data:new Date('2026-06-20'), cidade:'Caruaru', estado:'PE', distancias:'5km, 10km', linkInscricao:'https://www.sympla.com.br', preco:69.90, organizador:'Correr Mais', fonte:'manual' },
    { nome:'Corrida pela Paz Aracaju', data:new Date('2026-07-05'), cidade:'Aracaju', estado:'SE', distancias:'3km, 5km, 10km', linkInscricao:'https://www.ticketsports.com.br', preco:49.90, organizador:'Prefeitura', fonte:'manual' }
  ];
  for (const c of corridas) {
    const id = c.nome.toLowerCase().replace(/[^a-z0-9]/g,'-').substring(0,30);
    await prisma.corridaAberta.upsert({ where:{id}, create:{id,...c}, update:c });
  }
  console.log(corridas.length + ' corridas cadastradas!');
}
seed().then(()=>prisma.$disconnect()).catch(e=>{console.error(e);process.exit(1);});
  console.log(corridas.length + " corridas cadastradas!");
}
seed().then(()=>prisma.$disconnect()).catch(e=>{console.error(e);process.exit(1);});
