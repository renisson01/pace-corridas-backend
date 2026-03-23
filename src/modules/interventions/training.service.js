export function generateTrainingRecommendation(s) {
  const hrv = s.hrv ?? 55, sleep = s.sleepScore ?? 70, stress = s.stressScore ?? 50, vo2 = s.vo2max ?? 45;
  const readiness = Math.round((Math.min(100, hrv/80*100) * 0.5) + (sleep * 0.3) + ((100-stress) * 0.2));
  const pace = (intensity) => { const base = 3600/(vo2*0.8); const m = {easy:1.25,moderate:1.10,threshold:1.02}; const sec = base*(m[intensity]??1.15); return Math.floor(sec/60)+':'+String(Math.round(sec%60)).padStart(2,'0')+'/km'; };
  if (readiness < 30) return { type:'rest', name:'Descanso Ativo', readiness, sessions:[{activity:'Caminhada leve ou yoga',duration:30,heartZone:'Z1'}], warning:'⚠️ Readiness baixo. Recuperação.' };
  if (readiness < 60) return { type:'recovery_run', name:'Corrida de Recuperação', readiness, sessions:[{activity:'Corrida leve',duration:30,pace:pace('easy'),heartZone:'Z2'}], tip:'Pace confortável.' };
  if (readiness < 80) return { type:'aerobic', name:'Treino Aeróbico', readiness, sessions:[{activity:'Corrida contínua',duration:45,pace:pace('moderate'),heartZone:'Z3'}], tip:'Aqueça 10min em Z2.' };
  return { type:'quality', name:'Treino de Qualidade', readiness, sessions:[{phase:'aquecimento',activity:'Corrida leve',duration:10,heartZone:'Z2'},{phase:'principal',activity:'Intervalado',duration:30,heartZone:'Z4',pace:pace('threshold')},{phase:'desaquecimento',activity:'Caminhada',duration:10,heartZone:'Z1'}], tip:'🔥 Corpo pronto para performance.' };
}
