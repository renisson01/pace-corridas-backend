const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  console.log('🏃 PACE BRAZIL - Criando Comunidades');

  let admin = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!admin) {
    console.log('⚠️  Nenhum usuário. Crie conta no app primeiro!');
    return;
  }
  console.log('👤 Admin:', admin.name);

  // ITA ELAS
  const itaElas = await prisma.comunidade.upsert({
    where: { slug: 'ita-elas' },
    create: {
      nome: 'ITA ELAS', slug: 'ita-elas',
      descricao: 'Mais que um treino, uma rede de apoio. 💜 Grupo gratuito exclusivo para mulheres corredoras de Itabaiana/SE.',
      cor: '#9333EA', tipo: 'feminino', generoRestrito: 'F',
      local: 'Praça Chiara Lubich, Itabaiana/SE', cidade: 'Itabaiana', estado: 'SE',
      criadorId: admin.id
    },
    update: {}
  });

  const treinosElas = [
    { id: 'ita-elas-segunda-matutino', titulo: 'ITA ELAS — Segunda Manhã ☀️', dia: 'segunda', hora: '05:00', per: 'matutino' },
    { id: 'ita-elas-segunda-noturno', titulo: 'ITA ELAS — Segunda Noite 🌙', dia: 'segunda', hora: '19:00', per: 'noturno' },
    { id: 'ita-elas-terca-matutino', titulo: 'ITA ELAS — Terça Manhã ☀️', dia: 'terca', hora: '05:00', per: 'matutino' },
    { id: 'ita-elas-terca-noturno', titulo: 'ITA ELAS — Terça Noite 🌙', dia: 'terca', hora: '19:00', per: 'noturno' },
  ];
  for (const t of treinosElas) {
    await prisma.treino.upsert({
      where: { id: t.id },
      create: { id: t.id, comunidadeId: itaElas.id, titulo: t.titulo, diaSemana: t.dia, horario: t.hora, periodo: t.per, local: 'Praça Chiara Lubich', recorrente: true },
      update: {}
    });
  }
  console.log('💜 ITA ELAS + 4 treinos');

  // ITA NIGHT RUN
  const itaNight = await prisma.comunidade.upsert({
    where: { slug: 'ita-night-run' },
    create: {
      nome: 'ITA NIGHT RUN', slug: 'ita-night-run',
      descricao: 'Sua dose de endorfina sob as luzes da cidade. 🌃 Todas as quartas às 19h. Gratuito!',
      cor: '#F59E0B', tipo: 'aberto', generoRestrito: null,
      local: 'Praça Chiara Lubich, Itabaiana/SE', cidade: 'Itabaiana', estado: 'SE',
      criadorId: admin.id
    },
    update: {}
  });

  await prisma.treino.upsert({
    where: { id: 'ita-night-quarta' },
    create: { id: 'ita-night-quarta', comunidadeId: itaNight.id, titulo: 'Night Run — Quarta 🌃', diaSemana: 'quarta', horario: '19:00', periodo: 'noturno', local: 'Praça Chiara Lubich', recorrente: true },
    update: {}
  });
  console.log('🌃 ITA NIGHT RUN + 1 treino');

  for (const c of [itaElas, itaNight]) {
    await prisma.membroComunidade.upsert({
      where: { userId_comunidadeId: { userId: admin.id, comunidadeId: c.id } },
      create: { userId: admin.id, comunidadeId: c.id, role: 'admin' },
      update: {}
    });
  }

  console.log('');
  console.log('✅ COMUNIDADES PRONTAS!');
  console.log('💜 ITA ELAS — Seg+Ter, 5h e 19h (só mulheres)');
  console.log('🌃 ITA NIGHT RUN — Quarta 19h (todos)');
  console.log('📍 Praça Chiara Lubich, Itabaiana/SE');
}

seed().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1); });
