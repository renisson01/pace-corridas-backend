export function generateStressProtocol(s) {
  const stress = s.stressScore ?? 50, hrv = s.hrv ?? 55;
  const obj = hrv < 45 ? 'high' : hrv < 60 ? 'moderate' : 'low';
  const protocols = [];
  if (stress > 70 || obj === 'high') { protocols.push({name:'Respiração fisiológica',duration:'2min',description:'Dupla inspiração + expire longo.'},{name:'Caminhada 20min',duration:'20min',description:'Sem fone. Foco visual distante.'},{name:'NSDR / Yoga Nidra',duration:'10min',description:'Restaura dopamina.'}); }
  else if (stress > 40) { protocols.push({name:'Box Breathing',duration:'5min',description:'4s in, 4s hold, 4s out, 4s hold.'},{name:'Sol matinal',duration:'10min',description:'Regula cortisol.'}); }
  else { protocols.push({name:'Manter rotina',duration:'-',description:'Stress saudável.'}); }
  return { stressScore:stress, objectiveLevel:obj, protocols, status: stress > 70 ? 'alto' : stress > 40 ? 'moderado' : 'baixo',
    message: stress > 70 ? '🚨 Stress elevado. Intervenção hoje.' : stress > 40 ? '⚠️ Stress moderado.' : '✅ Stress controlado.' };
}
