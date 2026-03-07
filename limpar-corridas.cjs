const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function limpar() {
  const races = await prisma.race.findMany({ include: { _count: { select: { results: true } } } });
  console.log(races.length + ' corridas no total');
  
  let deletadas = 0;
  let mantidas = 0;
  
  for (const r of races) {
    if (r._count.results > 0) {
      console.log('MANTIDA: ' + r.name + ' (' + r._count.results + ' resultados)');
      mantidas++;
    } else {
      await prisma.race.delete({ where: { id: r.id } });
      deletadas++;
    }
  }
  
  console.log('---');
  console.log(deletadas + ' corridas deletadas');
  console.log(mantidas + ' corridas mantidas');
}

limpar().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1); });
