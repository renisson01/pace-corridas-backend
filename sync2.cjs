const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:LegLYYuCrLfOAHfuaXeDdGKbqPyxzsDy@maglev.proxy.rlwy.net:27005/railway' } } });
(async () => {
  try {
    const t = await p.integracaoToken.findFirst({ where: { userId: 'cmm5c9an70000le01ngqckcme', provider: 'strava' } });
    if (!t) { console.log('Strava NAO conectado. Clique Authorize primeiro!'); return; }
    console.log('CONECTADO! Atleta:', t.athleteName);
    
    const res = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=30', {
      headers: { 'Authorization': 'Bearer ' + t.accessToken }
    });
    const atividades = await res.json();
    if (!Array.isArray(atividades)) { console.log('Token expirado ou erro:', atividades); return; }
    
    const corridas = atividades.filter(a => a.type === 'Run');
    console.log('Corridas encontradas:', corridas.length);
    
    let ok = 0;
    for (const a of corridas) {
      const distKm = parseFloat((a.distance / 1000).toFixed(2));
      const dur = a.moving_time;
      const paceSeg = distKm > 0 ? dur / distKm : 0;
      const pace = Math.floor(paceSeg/60) + ':' + String(Math.floor(paceSeg%60)).padStart(2,'0');
      
      await p.atividadeGPS.upsert({
        where: { stravaId: String(a.id) },
        create: {
          userId: 'cmm5c9an70000le01ngqckcme',
          stravaId: String(a.id),
          fonte: 'strava',
          tipo: 'corrida',
          distanciaKm: distKm,
          duracaoSeg: dur,
          paceMedio: pace,
          velMedia: parseFloat((distKm / (dur/3600)).toFixed(2)),
          elevacaoGanho: a.total_elevation_gain || 0,
          titulo: a.name || 'Corrida Strava',
          compartilhado: false,
          iniciadoEm: new Date(a.start_date),
          finalizadoEm: new Date(new Date(a.start_date).getTime() + dur * 1000),
        },
        update: { titulo: a.name }
      }).then(() => {
        ok++;
        console.log('  ' + ok + '. ' + a.name + ' - ' + distKm + 'km - pace ' + pace);
      }).catch(() => {});
    }
    
    console.log('\nSINCRONIZADAS: ' + ok + ' corridas!');
    console.log('Abre o dashboard Cobaia pra ver os treinos!');
  } catch(e) { console.error('ERRO:', e.message); }
  finally { await p.$disconnect(); }
})();
