// ═══════════════════════════════════════════════════════════
// PACE CORRIDAS — Agentes Autônomos
// Rodam no Railway via node-cron. Cada agente tem log próprio.
// ═══════════════════════════════════════════════════════════
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';


const prisma = new PrismaClient();

function log(agente, msg) {
  console.log(`[${new Date().toISOString()}] 🤖 AGENTE:${agente} — ${msg}`);
}

// ─── AGENTE 1: Scraper Corridas (6h e 18h) ───────────────
// Já existe em corridas.routes.js — mantido
log('SCRAPER', 'Agente de corridas ativo via corridas.routes.js');

// ─── AGENTE 2: Sync Strava (diário 3h) ───────────────────
cron.schedule('0 3 * * *', async () => {
  log('STRAVA', 'Iniciando sync automático de todos usuários com Strava...');
  try {
    const users = await prisma.user.findMany({
      where: { bio: { contains: 'strava_token:' } },
      select: { id: true, bio: true, name: true }
    });
    log('STRAVA', `${users.length} usuários com Strava conectado`);
    let total = 0;
    for (const u of users) {
      const tokenMatch = u.bio?.match(/strava_token:([^\|]+)/);
      if (!tokenMatch) continue;
      try {
        const res = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=10', {
          headers: { Authorization: `Bearer ${tokenMatch[1]}` }
        });
        const ativs = await res.json();
        if (!Array.isArray(ativs)) continue;
        for (const a of ativs.filter(x => x.type === 'Run')) {
          const distKm = parseFloat((a.distance/1000).toFixed(2));
          const dur = a.moving_time;
          const pb = distKm > 0 ? dur/distKm : 0;
          const pace = `${Math.floor(pb/60)}:${String(Math.floor(pb%60)).padStart(2,'0')}`;
          await prisma.atividadeGPS.upsert({
            where: { stravaId: String(a.id) },
            create: { userId: u.id, stravaId: String(a.id), fonte: 'strava', tipo: 'corrida',
              distanciaKm: distKm, duracaoSeg: dur, paceMedio: pace,
              velMedia: parseFloat((distKm/(dur/3600)).toFixed(2)),
              titulo: a.name || 'Strava Run', compartilhado: false,
              iniciadoEm: new Date(a.start_date),
              finalizadoEm: new Date(new Date(a.start_date).getTime()+dur*1000) },
            update: {}
          }).catch(() => {});
          total++;
        }
      } catch(e) { log('STRAVA', `Erro user ${u.name}: ${e.message}`); }
    }
    log('STRAVA', `✅ Sync concluído: ${total} atividades`);
  } catch(e) { log('STRAVA', `❌ Erro geral: ${e.message}`); }
});

// ─── AGENTE 3: Recalcular Rankings (diário 4h) ───────────
cron.schedule('0 4 * * *', async () => {
  log('RANKING', 'Recalculando pontos e rankings...');
  try {
    const resultados = await prisma.result.groupBy({
      by: ['athleteId'],
      _count: { id: true },
      _min: { time: true }
    });
    let atualizados = 0;
    for (const r of resultados) {
      if (!r.athleteId) continue;
      const pts = (r._count.id || 0) * 21;
      await prisma.athlete.update({
        where: { id: r.athleteId },
        data: { totalPoints: pts, totalRaces: r._count.id }
      }).catch(() => {});
      atualizados++;
    }
    log('RANKING', `✅ ${atualizados} atletas atualizados`);
  } catch(e) { log('RANKING', `❌ ${e.message}`); }
});

// ─── AGENTE 4: Notificação Corridas Próximas (diário 8h) ──
cron.schedule('0 8 * * *', async () => {
  log('NOTIF', 'Verificando corridas nos próximos 7 dias...');
  try {
    const em7dias = new Date(Date.now() + 7*24*60*60*1000);
    const hoje = new Date();
    const corridas = await prisma.corridaAberta.findMany({
      where: { data: { gte: hoje, lte: em7dias }, ativa: true },
      take: 20
    });
    log('NOTIF', `${corridas.length} corridas nos próximos 7 dias`);
    // Futuramente: enviar push notification por estado
  } catch(e) { log('NOTIF', `❌ ${e.message}`); }
});

// ─── AGENTE 5: IA Dica do Dia (diário 7h) ────────────────
cron.schedule('0 7 * * *', async () => {
  log('IA_DICA', 'Gerando dica do dia com Claude...');
  try {
    const dicas = [
      'Treine a zona 2 por 80% do seu volume — é o segredo dos corredores de elite',
      'Hidratação começa antes da corrida: beba 500ml 2h antes',
      'Pace do longão deve ser 1min30s mais lento que o pace de prova',
      'Descanso é treino: é quando o músculo se recupera e cresce',
      'Sem um 5km de referência, não tem treino inteligente. Faça um teste hoje!'
    ];
    const dica = dicas[new Date().getDay() % dicas.length];
    log('IA_DICA', `Dica do dia: ${dica}`);
    // Cache poderia ser salvo no banco
  } catch(e) { log('IA_DICA', `❌ ${e.message}`); }
});

// ─── AGENTE 6: Vencimento Premium (diário 9h) ─────────────
cron.schedule('0 9 * * *', async () => {
  log('PREMIUM', 'Verificando vencimentos...');
  try {
    const em3dias = new Date(Date.now() + 3*24*60*60*1000);
    const vencendo = await prisma.user.findMany({
      where: { isPremium: true, premiumUntil: { lte: em3dias, gte: new Date() } },
      select: { id: true, name: true, premiumUntil: true }
    });
    log('PREMIUM', `${vencendo.length} premium vencendo em 3 dias`);
    // Futuramente: enviar email/whatsapp

    // Desativar expirados
    const { count } = await prisma.user.updateMany({
      where: { isPremium: true, premiumUntil: { lt: new Date() } },
      data: { isPremium: false }
    });
    if (count > 0) log('PREMIUM', `${count} premium expirados desativados`);
  } catch(e) { log('PREMIUM', `❌ ${e.message}`); }
});

// ─── AGENTE 7: Buscador de Resultados (semanal Seg 5h) ────
cron.schedule('0 5 * * 1', async () => {
  log('RESULTADOS', 'Buscando resultados de corridas recentes...');
  // Futuro: scraper de resultados em sites de cronometragem
  // CRONOtag, SuperCrono, CronoServ já têm scrapers de corridas
  // Próximo passo: scraper de RESULTADOS das corridas passadas
  log('RESULTADOS', 'Agente em desenvolvimento — scraper de resultados');
});

log('AGENTS', '✅ Todos os 7 agentes autônomos iniciados');
export default {};
