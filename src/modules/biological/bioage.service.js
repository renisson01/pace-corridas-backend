import prisma from '../../lib/prisma.js';

const WEIGHTS = { vo2max: 0.15, hrv: 0.10, sleepScore: 0.08, stressScore: 0.05 };

export function calculateBioAge(userData) {
  const { chronoAge, vo2max, hrv, sleepScore, stressScore } = userData;
  if (!chronoAge) throw new Error('chronoAge obrigatório');

  const safeVO2 = vo2max ?? 40, safeHRV = hrv ?? 50, safeSleep = sleepScore ?? 70, safeStress = stressScore ?? 50;
  const vo2Norm = (safeVO2 - 40) / 25 * 10;
  const hrvNorm = (safeHRV - 50) / 30 * 10;
  const sleepNorm = (safeSleep - 70) / 30 * 10;
  const stressImp = (safeStress - 50) / 50 * 10;
  const delta = (WEIGHTS.vo2max * vo2Norm) + (WEIGHTS.hrv * hrvNorm) + (WEIGHTS.sleepScore * sleepNorm) - (WEIGHTS.stressScore * stressImp);
  const bioAge = Math.max(1, chronoAge - delta);

  return {
    bioAge: Math.round(bioAge * 10) / 10, chronoAge, delta: Math.round(delta * 10) / 10,
    interpretation: interpretDelta(delta),
    inputs: { vo2max: safeVO2, hrv: safeHRV, sleepScore: safeSleep, stressScore: safeStress }
  };
}

function interpretDelta(d) {
  if (d > 8) return { label: 'Elite', emoji: '🚀', score: 100 };
  if (d > 5) return { label: 'Excelente', emoji: '✅', score: 85 };
  if (d > 2) return { label: 'Acima da média', emoji: '📈', score: 70 };
  if (d > 0) return { label: 'Na média', emoji: '➡️', score: 55 };
  if (d > -3) return { label: 'Atenção', emoji: '⚠️', score: 35 };
  return { label: 'Crítico', emoji: '🚨', score: 10 };
}

export async function saveBioAgeRecord(userId, data) {
  return prisma.bioAgeRecord.create({
    data: { userId, chronoAge: data.chronoAge, bioAge: data.bioAge, delta: data.delta,
      vo2max: data.inputs.vo2max, hrv: data.inputs.hrv, sleepScore: data.inputs.sleepScore,
      stressScore: data.inputs.stressScore, label: data.interpretation.label, score: data.interpretation.score }
  });
}

export async function getBioAgeHistory(userId, limit = 30) {
  return prisma.bioAgeRecord.findMany({
    where: { userId }, orderBy: { createdAt: 'desc' }, take: limit,
    select: { id: true, bioAge: true, chronoAge: true, delta: true, label: true, score: true, hrv: true, vo2max: true, sleepScore: true, createdAt: true }
  });
}

export async function predictBioAge(userId) {
  const history = await getBioAgeHistory(userId, 10);
  if (history.length < 2) return { prediction: null, message: 'Dados insuficientes. Continue registrando.' };
  const deltas = history.map(r => r.delta);
  const trend = (deltas[0] - deltas[deltas.length - 1]) / deltas.length;
  const latest = history[0];
  const p90 = latest.bioAge - (trend * 3);
  const p180 = latest.bioAge - (trend * 6);
  return {
    current: latest.bioAge, chronoAge: latest.chronoAge,
    in90days: Math.round(p90 * 10) / 10, in180days: Math.round(p180 * 10) / 10,
    trend: trend > 0 ? 'melhorando' : trend < 0 ? 'piorando' : 'estável',
    trendValue: Math.round(trend * 10) / 10,
    message: trend > 0.1 ? '🚀 Em 90 dias sua bioidade será ~' + Math.round(p90) + ' (' + (latest.chronoAge - p90).toFixed(1) + ' anos mais jovem).'
      : trend < -0.1 ? '⚠️ Tendência negativa. Ajuste o protocolo.' : '➡️ Estável. Continue o protocolo.'
  };
}
