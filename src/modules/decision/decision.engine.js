import prisma from '../../lib/prisma.js';
import { getBioAgeHistory } from '../biological/bioage.service.js';
import { generateSaunaProtocol } from '../interventions/sauna.service.js';
import { generateTrainingRecommendation } from '../interventions/training.service.js';
import { generateSleepProtocol } from '../interventions/sleep.service.js';
import { generateStressProtocol } from '../interventions/stress.service.js';

export async function decideNextAction(userId, s) {
  const hrv = s.hrv ?? 55, sleep = s.sleepScore ?? 70, stress = s.stressScore ?? 50;
  const ageDelta = (s.chronoAge && s.bioAge) ? +(s.chronoAge - s.bioAge).toFixed(1) : null;
  const priorities = [];
  const dayPlan = [];

  if (ageDelta !== null) {
    if (ageDelta < -3) priorities.push({ urgency:'critical', system:'bioage', message:'🚨 Bioidade ' + Math.abs(ageDelta) + ' anos acima.', action:'Revisar tudo.' });
    else if (ageDelta < 0) priorities.push({ urgency:'high', system:'bioage', message:'⚠️ Bioidade levemente acima.', action:'Foco em sono e stress.' });
  }
  if (hrv < 40) priorities.push({ urgency:'high', system:'hrv', message:'⚠️ HRV crítico (' + hrv + 'ms).', action:'Cancelar treino intenso.' });
  if (sleep < 60) priorities.push({ urgency:'high', system:'sleep', message:'⚠️ Sono ruim (' + sleep + '%).', action:'Protocolo de sono ativado.' });

  const training = generateTrainingRecommendation(s);
  dayPlan.push({ time:'manhã', category:'treino', ...training });
  if (hrv >= 45) dayPlan.push({ time:'tarde', category:'sauna', protocol: generateSaunaProtocol(s) });
  dayPlan.push({ time:'noite', category:'sono', protocol: generateSleepProtocol(s) });
  if (stress > 50) dayPlan.push({ time:'qualquer_momento', category:'stress', protocol: generateStressProtocol(s) });

  try { await prisma.decisionLog.create({ data: { userId, userState: s, priorities, dayPlan, ageDelta } }); } catch(e) {}

  const crit = priorities.find(p => p.urgency === 'critical');
  const high = priorities.find(p => p.urgency === 'high');
  let coachMessage = '➡️ Dia de manutenção. Zona 2 e bom sono.';
  if (crit) coachMessage = crit.message + ' ' + crit.action;
  else if (high) coachMessage = '⚠️ Dia de recuperação. ' + high.action;
  else if (ageDelta > 5) coachMessage = '🚀 Você está ' + ageDelta + ' anos mais jovem. Continue.';
  else if (training.readiness >= 80) coachMessage = '💪 Corpo pronto. HRV ' + hrv + 'ms. Dia de qualidade.';
  else if (training.readiness >= 60) coachMessage = '✅ Bom dia para treino moderado.';

  return { coachMessage, priorities, dayPlan, summary: { hrv, sleep, stress, bioAgeDelta: ageDelta, readiness: training.readiness, trainingType: training.type }, generatedAt: new Date().toISOString() };
}
