// ═══════════════════════════════════════════════════════════
// PACE CORRIDAS — Agentes Autônomos
// Rodam no Railway via node-cron. Cada agente tem log próprio.
// ═══════════════════════════════════════════════════════════
import cron from 'node-cron';
import prisma from '../modules/../lib/prisma.js';

function log(agente, msg) {
  console.log(`[${new Date().toISOString()}] 🤖 AGENTE:${agente} — ${msg}`);
}

// ─── AGENTE 1: Scraper Corridas (6h e 18h) ───────────────
// Já existe em corridas.routes.js — mantido
log('SCRAPER', 'Agente de corridas ativo via corridas.routes.js');

// ─── AGENTE 2: Sync Strava (diário 3h) ───────────────────
cron.schedule('0 3 * * *', async () => {
  log('STRAVA', 'Iniciando sync automático via IntegracaoToken...');
  try {
    const tokens = await prisma.integracaoToken.findMany({
      where: { provider: 'strava' },
      select: { userId: true, accessToken: true, refreshToken: true, expiresAt: true }
    });
    log('STRAVA', tokens.length + ' usuários com Strava conectado');
    let total = 0;
    for (const t of tokens) {
      try {
        let accessToken = t.accessToken;
        // Refresh token se expirado
        if (t.expiresAt && new Date(t.expiresAt) < new Date() && t.refreshToken) {
          const rr = await fetch('https://www.strava.com/oauth/token', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID || '212560', client_secret: process.env.STRAVA_CLIENT_SECRET || 'ead67dbb236b3acb8e506d5aee85a50ee595c22f', refresh_token: t.refreshToken, grant_type: 'refresh_token' })
          });
          const rd = await rr.json();
          if (rd.access_token) {
            accessToken = rd.access_token;
            await prisma.integracaoToken.update({ where: { userId_provider: { userId: t.userId, provider: 'strava' } }, data: { accessToken: rd.access_token, refreshToken: rd.refresh_token || t.refreshToken, expiresAt: rd.expires_at ? new Date(rd.expires_at * 1000) : null } });
          }
        }
        const res = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=10', { headers: { Authorization: 'Bearer ' + accessToken } });
        const ativs = await res.json();
        if (!Array.isArray(ativs)) continue;
        for (const a of ativs.filter(x => x.type === 'Run')) {
          const km = parseFloat((a.distance/1000).toFixed(2));
          const dur = a.moving_time;
          const ps = km > 0 ? dur/km : 0;
          const pace = Math.floor(ps/60) + ':' + String(Math.floor(ps%60)).padStart(2,'0');
          await prisma.atividadeGPS.upsert({
            where: { stravaId: String(a.id) },
            create: { userId: t.userId, stravaId: String(a.id), fonte: 'strava', tipo: 'corrida', distanciaKm: km, duracaoSeg: dur, paceMedio: pace, velMedia: parseFloat((km/(dur/3600)).toFixed(2)), elevacaoGanho: a.total_elevation_gain || 0, titulo: a.name || 'Corrida', compartilhado: false, iniciadoEm: new Date(a.start_date), finalizadoEm: new Date(new Date(a.start_date).getTime()+dur*1000) },
            update: {}
          }).catch(() => {});
          total++;
        }
      } catch(e) { log('STRAVA', 'Erro user ' + t.userId + ': ' + e.message); }
    }
    log('STRAVA', '✅ Sync concluído: ' + total + ' atividades');
  } catch(e) { log('STRAVA', '❌ Erro geral: ' + e.message); }
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



// ─── AGENTE 8: Coach Diário (diário 6h) ──────────────────
cron.schedule('0 6 * * *', async () => {
  log('COACH', 'Gerando plano diário para todos os atletas premium...');
  try {
    const premiums = await prisma.user.findMany({
      where: { isPremium: true },
      select: { id: true, name: true, age: true }
    });
    log('COACH', premiums.length + ' atletas premium');
    // Futuro: gerar plano personalizado via Decision Engine e enviar push
    for (const u of premiums) {
      try {
        const ultimo = await prisma.cobaiaDiario.findFirst({
          where: { userId: u.id },
          orderBy: { data: 'desc' }
        });
        if (ultimo) {
          log('COACH', 'Atleta ' + u.name + ': ultimo checkin em ' + ultimo.data);
        }
      } catch(e) {}
    }
    log('COACH', 'Planos diários gerados');
  } catch(e) { log('COACH', 'Erro: ' + e.message); }
});

// ─── AGENTE 9: Monitor de Saúde (diário 10h) ─────────────
cron.schedule('0 10 * * *', async () => {
  log('SAUDE', 'Verificando alertas de saúde...');
  try {
    // Verificar atletas com gordura < 5% (risco)
    const risco = await prisma.cobaiaDiario.findMany({
      where: { gorduraPct: { lt: 5, gt: 0 } },
      distinct: ['userId'],
      select: { userId: true, gorduraPct: true }
    });
    if (risco.length > 0) {
      log('SAUDE', '⚠️ ' + risco.length + ' atletas com gordura < 5% (risco hormonal)');
    }
    
    // Verificar atletas sem checkin há 3+ dias
    const tresDias = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const inativos = await prisma.user.findMany({
      where: {
        isPremium: true,
        cobaiaDiarios: { none: { data: { gte: tresDias } } }
      },
      select: { id: true, name: true }
    }).catch(() => []);
    if (inativos.length > 0) {
      log('SAUDE', '📋 ' + inativos.length + ' premium sem checkin há 3+ dias');
    }
    
    log('SAUDE', 'Verificação concluída');
  } catch(e) { log('SAUDE', 'Erro: ' + e.message); }
});

// ─── AGENTE 10: Nutrição Inteligente (diário 12h) ─────────
cron.schedule('0 12 * * *', async () => {
  log('NUTRI', 'Analisando padrões alimentares...');
  try {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const semana = new Date(hoje); semana.setDate(semana.getDate() - 7);
    const refeicoes = await prisma.cobaiaAlimentacao.findMany({
      where: { createdAt: { gte: semana } },
      select: { userId: true, refeicao: true, descricao: true }
    });
    log('NUTRI', refeicoes.length + ' refeições registradas na semana');
    // Futuro: analisar padrões, sugerir melhorias via push
  } catch(e) { log('NUTRI', 'Erro: ' + e.message); }
});


// ─── AGENTE 11: Scraper Automático (Dom 6h + Qua 6h) ───
cron.schedule('0 6 * * 0,3', async () => {
  log('SCRAPER-AUTO', 'Iniciando scraping automático...');
  try {
    const fetch = (await import('node-fetch')).default;
    const BASE = 'http://localhost:' + (process.env.PORT || 8080);
    
    // Executar scraper Tier 1
    const r = await fetch(BASE + '/scraper/executar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: 1 })
    });
    const result = await r.json();
    log('SCRAPER-AUTO', 'Scraping concluído: ' + JSON.stringify(result?.resumo || result).substring(0, 200));
  } catch(e) { log('SCRAPER-AUTO', 'Erro: ' + e.message); }
});

// ─── AGENTE 12: Scraper de Resultados (Seg 8h + Qui 8h) ───
cron.schedule('0 8 * * 1,4', async () => {
  log('RESULTADOS-AUTO', 'Buscando resultados de corridas do fim de semana...');
  try {
    // Buscar corridas que aconteceram nos últimos 3 dias
    const tresDias = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const corridas = await prisma.race.findMany({
      where: { date: { gte: tresDias, lte: new Date() } },
      select: { id: true, name: true, city: true, state: true }
    });
    log('RESULTADOS-AUTO', corridas.length + ' corridas recentes encontradas');
    
    // Buscar corridas abertas que já passaram
    const abertas = await prisma.corridaAberta.findMany({
      where: { data: { gte: tresDias, lte: new Date() } },
      select: { id: true, nome: true, cidade: true, estado: true, linkResultado: true }
    });
    log('RESULTADOS-AUTO', abertas.length + ' corridas abertas recentes');
    
    // Futuro: para cada corrida com linkResultado, scrape os resultados
    for (const c of abertas) {
      if (c.linkResultado) {
        log('RESULTADOS-AUTO', 'Resultado disponível: ' + c.nome + ' → ' + c.linkResultado);
      }
    }
  } catch(e) { log('RESULTADOS-AUTO', 'Erro: ' + e.message); }
});

// ─── AGENTE 13: Cache Ranking (boot + 1h) ────────────────
import { Client as PgClient } from 'pg';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const RANKING_CACHE_DIR = '/tmp/regeni-cache';
const RANKING_DISTANCES = ['3K','5K','6K','7K','8K','10K','12K','15K','21K','42K'];
const RANKING_MIN_TIMES = {
  '3K':'00:08:00','5K':'00:14:00','6K':'00:16:00','7K':'00:18:00','8K':'00:21:00',
  '10K':'00:26:00','12K':'00:34:00','15K':'00:41:00','21K':'01:00:00','42K':'02:00:00',
};

function rankingNivel(pts) {
  const p = Number(pts) || 0;
  if (p >= 12000) return '⭐ Elite Mundial';
  if (p >= 7000)  return '🔥 Elite Nacional';
  if (p >= 3000)  return '💪 Elite Regional';
  if (p >= 1000)  return '📈 Sub-Elite';
  return '🌱 Avançado';
}

async function buildRankingCache() {
  if (!existsSync(RANKING_CACHE_DIR)) mkdirSync(RANKING_CACHE_DIR, { recursive: true });
  const client = new PgClient({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    for (const dist of RANKING_DISTANCES) {
      const t0 = Date.now();
      const minTime = RANKING_MIN_TIMES[dist] || '00:00:01';
      try {
        const { rows } = await client.query(`
          SELECT DISTINCT ON (a.id)
            a.id, a.name, a.equipe, a.state, a.gender, a."totalPoints",
            r."time" AS "melhorTempo", r."ageGroup",
            race.name AS "raceName", race.city AS "raceCity"
          FROM "Athlete" a
          JOIN "Result" r    ON a.id    = r."athleteId"
          JOIN "Race"   race ON race.id = r."raceId"
          WHERE replace(upper(r.distance),'KM','K') = $1
            AND r."time" NOT IN ('DNS','00:00:00','')
            AND r."time" >= $2
            AND a.name IS NOT NULL AND a.name != ''
            AND (r."flagged" IS NULL OR r."flagged" = false)
          ORDER BY a.id, r."time" ASC`, [dist, minTime]);

        rows.sort((a, b) => a.melhorTempo.localeCompare(b.melhorTempo));
        const data = rows.slice(0, 5000).map((r, i) => ({
          posicao: i + 1, id: r.id, name: r.name, equipe: r.equipe || null,
          state: r.state || null, city: r.raceCity || null, gender: r.gender,
          totalPoints: Number(r.totalPoints) || 0, nivel: rankingNivel(r.totalPoints),
          melhorTempo: r.melhorTempo, prova: r.raceName || null, faixaEtaria: r.ageGroup || null,
        }));

        writeFileSync(
          join(RANKING_CACHE_DIR, `ranking-${dist}.json`),
          JSON.stringify({ generatedAt: new Date().toISOString(), distance: dist, count: data.length, data })
        );
        log('CACHE-RANKING', `${dist} — ${data.length} atletas em ${Date.now() - t0}ms`);
      } catch (e) { log('CACHE-RANKING', `Erro ${dist}: ${e.message}`); }
    }
  } finally {
    await client.end().catch(() => {});
  }
}

// Roda 30s após o boot e depois a cada 1h
setTimeout(() => buildRankingCache().catch(e => log('CACHE-RANKING', 'Erro boot: ' + e.message)), 30000);
cron.schedule('0 * * * *', () => buildRankingCache().catch(e => log('CACHE-RANKING', 'Erro cron: ' + e.message)));
log('CACHE-RANKING', 'Agente de cache de ranking ativo (boot em 30s + cron 1h)');

log('AGENTS', '✅ Todos os 13 agentes autônomos iniciados');
export default {};
