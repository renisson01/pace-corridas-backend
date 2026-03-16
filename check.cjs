const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:LegLYYuCrLfOAHfuaXeDdGKbqPyxzsDy@maglev.proxy.rlwy.net:27005/railway' } } });
(async () => {
  try {
    const conv = await p.iaConversa.findFirst({ where: { userId: 'cmm5c9an70000le01ngqckcme' } });
    if (conv) {
      const msgs = JSON.parse(conv.mensagens);
      console.log('HISTORICO IA (' + msgs.length + ' mensagens):');
      msgs.forEach((m, i) => {
        console.log('\n--- ' + m.role.toUpperCase() + ' ---');
        console.log(m.content.substring(0, 300));
      });
    } else {
      console.log('Sem historico de conversa');
    }
    
    const ativs = await p.atividadeGPS.findMany({
      where: { userId: 'cmm5c9an70000le01ngqckcme' },
      orderBy: { iniciadoEm: 'desc' },
      take: 5,
      select: { titulo: true, distanciaKm: true, paceMedio: true, duracaoSeg: true, iniciadoEm: true, fonte: true }
    });
    console.log('\n\nULTIMOS 5 TREINOS:');
    ativs.forEach(a => console.log(a.titulo + ' | ' + a.distanciaKm + 'km | pace ' + a.paceMedio + ' | ' + a.fonte + ' | ' + new Date(a.iniciadoEm).toLocaleDateString('pt-BR')));
  } catch(e) { console.error('ERRO:', e.message); }
  finally { await p.$disconnect(); }
})();
