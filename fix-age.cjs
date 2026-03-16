const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:LegLYYuCrLfOAHfuaXeDdGKbqPyxzsDy@maglev.proxy.rlwy.net:27005/railway' } } });
(async () => {
  try {
    await p.user.update({
      where: { email: 'renisson@proton.me' },
      data: { age: 31, fcMax: 189, fcRepouso: 52, isPremium: true }
    });
    console.log('ATUALIZADO: idade 31, FC Max 189, FC Repouso 52, Premium TRUE');
    
    await p.iaPerfilCorredor.update({
      where: { userId: 'cmm5c9an70000le01ngqckcme' },
      data: {
        biologico: 'Homem, 31 anos (22/09/1994). Atleta elite retornando de 45 dias parado. PR 5km 17min. PR 10km 36:30. PR 21km 1:14. VO2max estimado 58-62. FC Max 189. FC Repouso ~52. Peso 54kg. TDAH usa Vyvanse dia sim dia nao. Itabaiana/SE.',
        historico: 'PR 21km 1:14 (2018). PR 5km 17:00. 5km retorno: 17:40 pace 3:32 em 15/03/2026 (negative split, ultimo km 3:24). 28 corridas no Strava sincronizadas. Tiros 400m a 2:59. Longao 19.4km. 10+ anos de corrida.',
      }
    });
    console.log('PERFIL IA ATUALIZADO com idade e FC');
  } catch(e) { console.error('ERRO:', e.message); }
  finally { await p.$disconnect(); }
})();
