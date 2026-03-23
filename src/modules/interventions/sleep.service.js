export function generateSleepProtocol(s) {
  const score = s.sleepScore ?? 70, stress = s.stressScore ?? 50;
  const actions = [];
  if (score < 60) { actions.push({priority:1,action:'Blackout total no quarto',impact:'alto'},{priority:2,action:'Temperatura: 18-20°C',impact:'alto'},{priority:3,action:'Sem telas 1h antes',impact:'alto'},{priority:4,action:'Horário fixo: acordar mesma hora',impact:'alto'},{priority:5,action:'Magnésio glicinato 400mg',impact:'médio'}); }
  else if (score < 75) { actions.push({priority:1,action:'Luz solar nos primeiros 30min',impact:'alto'},{priority:2,action:'Sem cafeína após 14h',impact:'médio'},{priority:3,action:'Temperatura ideal no quarto',impact:'médio'}); }
  else { actions.push({priority:1,action:'Manter rotina atual',impact:'manutenção'}); }
  if (stress > 70) { actions.push({priority:2,action:'NSDR / Yoga Nidra 10min',impact:'alto'},{priority:3,action:'Respiração 4-7-8 ao deitar',impact:'médio'}); }
  return { currentScore:score, targetScore:85, actions, status: score >= 75 ? 'bom' : score >= 60 ? 'regular' : 'crítico',
    message: score >= 85 ? '✅ Sono excelente.' : score >= 70 ? '➡️ Sono ok. Ajustes pequenos.' : score >= 55 ? '⚠️ Sono abaixo do ideal.' : '🚨 Sono crítico. Prioridade #1.' };
}
