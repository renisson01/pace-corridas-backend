const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:LegLYYuCrLfOAHfuaXeDdGKbqPyxzsDy@maglev.proxy.rlwy.net:27005/railway' } } });
(async () => {
  try {
    const t = await p.integracaoToken.findFirst({ where: { userId: 'cmm5c9an70000le01ngqckcme', provider: 'strava' } });
    if (!t) { console.log('Strava nao conectado ainda. Abre a URL primeiro!'); return; }
    console.log('STRAVA CONECTADO! Atleta:', t.athleteName);
    console.log('Token salvo em:', t.updatedAt);
  } catch(e) { console.error('ERRO:', e.message); }
  finally { await p.$disconnect(); }
})();
