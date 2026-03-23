export function generateSaunaProtocol(s) {
  const hrv = s.hrv ?? 55;
  const heavy = s.lastWorkoutIntensity === 'high' && (s.lastWorkoutHoursAgo ?? 999) < 12;
  if (hrv < 40) return { type:'recovery', name:'Recuperação Suave', temp:50, duration:12, rounds:1, cooldown:{type:'temperatura_ambiente',duration:120}, warning:'HRV muito baixo. Sauna leve.', nextIn:'36h', benefits:['relaxamento','parassimpático','cortisol'] };
  if (heavy || hrv < 50) return { type:'light', name:'Protocolo Leve', temp:60, duration:15, rounds:1, cooldown:{type:'ducha_fria',duration:30}, warning:'Treino recente. Conservador.', nextIn:'24h', benefits:['inflamação','relaxamento','sono'] };
  if (hrv < 65) return { type:'longevity', name:'Protocolo Longevidade', temp:80, duration:20, rounds:2, intervalo:10, cooldown:{type:'cold_plunge',duration:120}, tip:'Hidrate 500ml antes.', nextIn:'48h', benefits:['HSP70','mitocôndrias','cardiovascular'] };
  return { type:'performance', name:'Protocolo Performance', temp:90, duration:25, rounds:3, intervalo:8, cooldown:{type:'cold_plunge',duration:180}, tip:'Eletrólitos pós-sauna.', nextIn:'48h', benefits:['HSP máximo','GH','longevidade celular'] };
}
