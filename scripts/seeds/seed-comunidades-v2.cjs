const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function seed() {
  const admin = await prisma.user.findFirst({ where: { email: 'renisson@proton.me' } });
  if (!admin) { console.log('Admin nao encontrado'); process.exit(1); }
  console.log('Admin:', admin.name);

  const comunidades = [
    {
      id: 'corredores-itabaiana',
      nome: 'CORREDORES DE ITABAIANA',
      slug: 'corredores-de-itabaiana',
      descricao: 'O maior grupo de corrida de Itabaiana/SE. Todos os niveis, do iniciante ao avancado. Venha correr com a gente!',
      cor: '#00E676',
      tipo: 'aberto',
      generoRestrito: null,
      local: 'Praca Chiara Lubich, Itabaiana/SE',
      cidade: 'Itabaiana',
      estado: 'SE',
      criadorId: admin.id
    },
    {
      id: 'ita-elas-v2',
      nome: 'ITA ELAS',
      slug: 'ita-elas',
      descricao: 'Grupo exclusivo para mulheres corredoras de Itabaiana/SE. Mais que um treino, uma rede de apoio.',
      cor: '#9333EA',
      tipo: 'feminino',
      generoRestrito: 'F',
      local: 'Praca Chiara Lubich, Itabaiana/SE',
      cidade: 'Itabaiana',
      estado: 'SE',
      criadorId: admin.id
    }
  ];

  for (const c of comunidades) {
    const existe = await prisma.comunidade.findFirst({ where: { slug: c.slug } });
    if (existe) {
      console.log('Ja existe:', c.nome);
    } else {
      await prisma.comunidade.create({ data: c });
      console.log('Criada:', c.nome);
    }
  }

  // Adicionar admin como membro de ambas
  const coms = await prisma.comunidade.findMany({ where: { criadorId: admin.id } });
  for (const com of coms) {
    const jaMembro = await prisma.membroComunidade.findFirst({ where: { comunidadeId: com.id, userId: admin.id } });
    if (!jaMembro) {
      await prisma.membroComunidade.create({ data: { comunidadeId: com.id, userId: admin.id, role: 'admin' } });
      console.log('Admin adicionado em:', com.nome);
    }
  }

  console.log('Comunidades prontas!');
}
seed().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1); });
