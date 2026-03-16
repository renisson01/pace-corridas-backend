const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:LegLYYuCrLfOAHfuaXeDdGKbqPyxzsDy@maglev.proxy.rlwy.net:27005/railway' } } });
(async () => {
  try {
    const u = await p.user.findFirst({ where: { email: 'renisson@proton.me' } });
    if (!u) { console.log('USER NAO ENCONTRADO'); return; }
    console.log('ACHOU:', u.id, u.name, u.email);
    await p.user.update({ where: { id: u.id }, data: {
      name: 'Renisson Nascimento Aragao',
      city: 'Itabaiana',
      state: 'SE',
      equipe: 'PACE Team',
      tempo5k: '17:00',
      tempo10k: '36:30',
      tempo21k: '1:14:00',
      nivelAtleta: 'elite',
      isAdmin: true
    }});
    console.log('USER ATUALIZADO');
    await p.iaConversa.deleteMany({ where: { userId: u.id } });
    console.log('HISTORICO LIMPO');
    await p.iaPerfilCorredor.upsert({
      where: { userId: u.id },
      create: {
        userId: u.id,
        biologico: 'Atleta elite retornando de 45 dias parado. PR 5km 17min. PR 10km 36:30. PR 21km 1:14. TDAH usa Vyvanse dia sim dia nao.',
        psicologico: 'TDAH. Vyvanse dia sim dia nao. Alta motivacao founder.',
        funcional: 'Elite 10+ anos. Pausa 45 dias. Progressao conservadora.',
        objetivos: 'Protocolo Cobaia 60 dias. Sub-17 5km. Sub-36 10km.',
        limitacoes: 'Retornando 45 dias parado. TDAH afeta sono.',
        historico: 'PR 21km 1:14 (2018). Retorno 5km 17:40 pace 3:32 em 15/03/2026.',
        preferencias: 'Treina 18h. Proteina animal tuberculos frutas.'
      },
      update: {
        biologico: 'Atleta elite retornando de 45 dias parado. PR 5km 17min. PR 10km 36:30. PR 21km 1:14. TDAH usa Vyvanse dia sim dia nao.',
        psicologico: 'TDAH. Vyvanse dia sim dia nao. Alta motivacao founder.',
        funcional: 'Elite 10+ anos. Pausa 45 dias. Progressao conservadora.',
        objetivos: 'Protocolo Cobaia 60 dias. Sub-17 5km. Sub-36 10km.',
        limitacoes: 'Retornando 45 dias parado. TDAH afeta sono.',
        historico: 'PR 21km 1:14 (2018). Retorno 5km 17:40 pace 3:32 em 15/03/2026.',
        preferencias: 'Treina 18h. Proteina animal tuberculos frutas.'
      }
    });
    console.log('PERFIL IA CRIADO');
    console.log('TUDO PRONTO!');
  } catch(e) { console.error('ERRO:', e.message); }
  finally { await p.$disconnect(); }
})();
