
import { calcPace, paceToSeconds, timeToSeconds } from '../utils/paceCalculator.js';
import { calcPoints } from '../utils/ageGroupCalculator.js';

export function analyzeAthlete(results) {
  if(!results || results.length === 0) return null;

  const sorted = [...results].sort((a,b) => new Date(a.race?.date||0) - new Date(b.race?.date||0));

  // Pace por corrida
  const paces = sorted.map(r => ({
    date: r.race?.date,
    race: r.race?.name,
    distance: r.distance,
    paceSeconds: paceToSeconds(r.pace),
    time: r.time,
    rank: r.overallRank
  })).filter(p => p.paceSeconds > 0);

  // Médias
  const avgPace = paces.length ? Math.round(paces.reduce((s,p)=>s+p.paceSeconds,0)/paces.length) : 0;
  const bestPace = paces.length ? Math.min(...paces.map(p=>p.paceSeconds)) : 0;
  const worstPace = paces.length ? Math.max(...paces.map(p=>p.paceSeconds)) : 0;

  // Tendência (últimas 3 vs média)
  const recent = paces.slice(-3);
  const recentAvg = recent.length ? Math.round(recent.reduce((s,p)=>s+p.paceSeconds,0)/recent.length) : 0;
  const trend = recentAvg - avgPace;
  const trendLabel = trend > 30 ? 'PIORANDO' : trend < -30 ? 'MELHORANDO' : 'ESTÁVEL';

  // Recordes por distância
  const records = {};
  for(const r of results) {
    const dist = r.distance;
    if(!dist) continue;
    const sec = timeToSeconds(r.time);
    if(sec <= 0) continue;
    if(!records[dist] || sec < timeToSeconds(records[dist].time)) {
      records[dist] = { time: r.time, pace: r.pace, race: r.race?.name, date: r.race?.date };
    }
  }

  // Km totais
  const totalKm = results.reduce((sum,r) => {
    const km = parseFloat(String(r.distance||'0').replace('km','').replace(',','.'));
    return sum + (isNaN(km)?0:km);
  }, 0);

  // Pontuação total
  const totalPoints = results.reduce((sum,r) => sum + calcPoints(r.overallRank||0, r.ageGroupRank||0, r.ageGroup), 0);

  // Análise cardíaca
  const cardiacRisk = analyzeCardiacRisk(paces, results);

  return {
    totalRaces: results.length,
    totalKm: Math.round(totalKm),
    totalPoints,
    avgPace: formatPace(avgPace),
    bestPace: formatPace(bestPace),
    worstPace: formatPace(worstPace),
    trend: trendLabel,
    records,
    paceHistory: paces.slice(-10),
    podios: results.filter(r=>r.overallRank<=3).length,
    top10: results.filter(r=>r.overallRank<=10).length,
    cardiacRisk
  };
}

function formatPace(seconds) {
  if(!seconds) return '0:00';
  return Math.floor(seconds/60)+':'+(String(seconds%60).padStart(2,'0'));
}

function analyzeCardiacRisk(paces, results) {
  if(paces.length < 2) return { level:'SEM_DADOS', message:'Poucas corridas para análise' };

  const avg = paces.reduce((s,p)=>s+p.paceSeconds,0)/paces.length;
  const recent = paces.slice(-3);
  const recentAvg = recent.reduce((s,p)=>s+p.paceSeconds,0)/recent.length;
  const variation = Math.max(...paces.map(p=>p.paceSeconds)) - Math.min(...paces.map(p=>p.paceSeconds));
  const variationPct = (variation/avg)*100;

  let score = 0;
  const alerts = [];

  if(recentAvg - avg > 60) { score+=30; alerts.push('Pace piorando nas últimas provas'); }
  if(variationPct > 40) { score+=25; alerts.push('Alta variação de desempenho ('+Math.round(variationPct)+'%)'); }

  const longRaces = results.filter(r=>r.distance?.includes('21')||r.distance?.includes('42'));
  if(longRaces.length>0) {
    const slowLong = longRaces.filter(r=>paceToSeconds(r.pace)>480);
    if(slowLong.length>0) { score+=20; alerts.push('Esforço elevado em longas distâncias'); }
  }

  const level = score>=50?'ALTO':score>=25?'MODERADO':'BAIXO';
  const recommendations = {
    ALTO: '⚠️ Consulte um cardiologista antes da próxima prova!',
    MODERADO: '⚡ Faça um check-up cardiovascular preventivo.',
    BAIXO: '✅ Seu padrão de pace está dentro da normalidade.'
  };

  return { level, score, alerts, recommendation: recommendations[level] };
}
