const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function limpar() {
  const races = await prisma.race.findMany();
  let del = 0, kept = 0;
  for (const r of races) {
    if (r.name.includes('Corrida da Amizade - 9a')) {
      console.log('MANTIDA:', r.name);
      kept++;
    } else {
      const count = await prisma.result.count({ where: { raceId: r.id } });
      if (count > 0) {
        await prisma.result.deleteMany({ where: { raceId: r.id } });
        console.log('Deletou ' + count + ' resultados de: ' + r.name);
      }
      await prisma.race.delete({ where: { id: r.id } });
      del++;
    }
  }
  console.log(del + ' corridas deletadas, ' + kept + ' mantidas');
}
limpar().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1); });
