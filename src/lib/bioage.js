/**
 * REGENI — Biological Age Engine v2
 * Baseado em: Composite Model do PDF + estudos Horvath/Fitzgerald
 * BioAge = ChronoAge - (a*VO2_score + b*HRV_score + c*Sleep_score + d*Training_score - e*Stress_score)
 */

// Coeficientes calibrados com literatura científica
const COEFS = {
  vo2: 3.0,      // VO2max é o preditor #1 de longevidade (ACC 2025)
  hrv: 1.5,      // HRV reflete saúde autonômica
  sleep: 2.0,    // Sono 8h+ = -4.6 anos (Fitzgerald 2023)
  training: 1.5, // Consistência > volume
  nutrition: 1.0,// Anti-inflamatória reduz PCR
  sauna: 0.5,    // HSPs, -40% mortalidade (Laukkanen 2015)
  stress: -1.0,  // Cortisol elevado acelera aging
  body: 1.0,     // Composição corporal
};

/**
 * Calcula score VO2 (0-100)
 * Baseado em VDOT/VO2max estimado vs população
 * VDOT 63.9 = top 1% = score ~95
 */
function vo2Score(dados) {
  if (dados.vdot) {
    if (dados.vdot >= 60) return 95;
    if (dados.vdot >= 55) return 85;
    if (dados.vdot >= 50) return 75;
    if (dados.vdot >= 45) return 65;
    if (dados.vdot >= 40) return 55;
    if (dados.vdot >= 35) return 40;
    return 25;
  }
  // Estimativa por pace 5km
  if (dados.pace5k) {
    const parts = dados.pace5k.split(':').map(Number);
    const segKm = parts[0] * 60 + (parts[1] || 0);
    if (segKm < 210) return 95;  // sub 3:30
    if (segKm < 240) return 85;  // sub 4:00
    if (segKm < 300) return 70;  // sub 5:00
    if (segKm < 360) return 55;  // sub 6:00
    return 35;
  }
  return 50; // default
}

/**
 * Calcula score HRV (0-100)
 * HRV > 70ms RMSSD = excelente para adulto
 */
function hrvScore(dados) {
  const hrv = dados.hrvMedia;
  if (!hrv) return 50; // sem dados = neutro
  if (hrv > 80) return 95;
  if (hrv > 60) return 80;
  if (hrv > 45) return 65;
  if (hrv > 30) return 45;
  return 25;
}

/**
 * Calcula score Sono (0-100)
 * 7-9h + qualidade alta = ótimo
 */
function sleepScore(dados) {
  let score = 50;
  const h = dados.horasSono;
  if (h >= 8 && h <= 9) score = 95;
  else if (h >= 7) score = 80;
  else if (h >= 6) score = 55;
  else if (h > 0) score = 30;

  // Qualidade (1-5)
  if (dados.qualidadeSono >= 4) score += 5;
  else if (dados.qualidadeSono <= 2) score -= 10;

  // Consistência (dormir/acordar regular)
  if (dados.sonoConsistente) score += 5;

  return Math.min(Math.max(score, 0), 100);
}

/**
 * Calcula score Treino (0-100)
 * Consistência + volume adequado + variação
 */
function trainingScore(dados) {
  let score = 30;

  // Treinou hoje
  if (dados.treinouHoje) score += 20;

  // Streak (consistência)
  if (dados.streak >= 14) score += 30;
  else if (dados.streak >= 7) score += 25;
  else if (dados.streak >= 3) score += 15;
  else if (dados.streak >= 1) score += 5;

  // Volume semanal (km)
  if (dados.kmSemana >= 40) score += 20;
  else if (dados.kmSemana >= 25) score += 15;
  else if (dados.kmSemana >= 15) score += 10;

  return Math.min(score, 100);
}

/**
 * Calcula score Corporal (0-100)
 * FC repouso baixa + gordura adequada
 */
function bodyScore(dados) {
  let score = 50;

  // FC Repouso (atleta elite < 55)
  if (dados.fcRepouso < 50) score += 25;
  else if (dados.fcRepouso < 55) score += 20;
  else if (dados.fcRepouso < 60) score += 15;
  else if (dados.fcRepouso < 70) score += 5;

  // Gordura corporal
  if (dados.gorduraPct > 0) {
    if (dados.gorduraPct < 12) score += 25;
    else if (dados.gorduraPct < 16) score += 20;
    else if (dados.gorduraPct < 20) score += 10;
  }

  return Math.min(score, 100);
}

/**
 * Calcula score Stress/TDAH (0-100, invertido: maior = menos stress)
 */
function stressScore(dados) {
  let score = 60;

  // Humor (1-10)
  if (dados.humor >= 8) score = 90;
  else if (dados.humor >= 6) score = 70;
  else if (dados.humor >= 4) score = 50;
  else if (dados.humor > 0) score = 30;

  // Energia (1-10)
  if (dados.energia >= 8) score += 10;
  else if (dados.energia < 4) score -= 15;

  // Vyvanse (dia com = stress farmacológico leve)
  if (dados.vyvanse) score -= 5;

  return Math.min(Math.max(score, 0), 100);
}

/**
 * Calcula Score Total (0-100)
 * Média ponderada de todos os fatores
 */
export function calcularScore(dados) {
  const scores = {
    vo2: vo2Score(dados),
    hrv: hrvScore(dados),
    sleep: sleepScore(dados),
    training: trainingScore(dados),
    body: bodyScore(dados),
    stress: stressScore(dados),
  };

  const totalWeight = COEFS.vo2 + COEFS.hrv + COEFS.sleep + COEFS.training + COEFS.body + Math.abs(COEFS.stress);

  const weighted = (
    scores.vo2 * COEFS.vo2 +
    scores.hrv * COEFS.hrv +
    scores.sleep * COEFS.sleep +
    scores.training * COEFS.training +
    scores.body * COEFS.body +
    scores.stress * Math.abs(COEFS.stress)
  ) / totalWeight;

  return {
    total: Math.round(weighted),
    fatores: scores,
    detalhes: {
      vo2: { score: scores.vo2, peso: COEFS.vo2, label: 'VO2max / Fitness' },
      hrv: { score: scores.hrv, peso: COEFS.hrv, label: 'Variabilidade Cardíaca' },
      sleep: { score: scores.sleep, peso: COEFS.sleep, label: 'Qualidade do Sono' },
      training: { score: scores.training, peso: COEFS.training, label: 'Consistência de Treino' },
      body: { score: scores.body, peso: COEFS.body, label: 'Composição Corporal' },
      stress: { score: scores.stress, peso: Math.abs(COEFS.stress), label: 'Nível de Stress' },
    }
  };
}

/**
 * Calcula Idade Biológica
 * Fórmula: BioAge = ChronoAge - bonus
 * Score 100 = -5 anos | Score 50 = 0 | Score 0 = +3 anos
 */
export function calcularIdadeBiologica(idadeReal, scoreObj) {
  const score = typeof scoreObj === 'number' ? scoreObj : scoreObj.total;
  // Score 50 = neutro (0 anos)
  // Cada ponto acima de 50 = -0.1 ano (max -5 anos com score 100)
  // Cada ponto abaixo de 50 = +0.06 ano (max +3 anos com score 0)
  let bonus = 0;
  if (score >= 50) {
    bonus = (score - 50) * 0.10; // max 5 anos de redução
  } else {
    bonus = (score - 50) * 0.06; // max 3 anos de aumento
  }
  return Number((idadeReal - bonus).toFixed(1));
}

/**
 * Gera relatório textual para IA/dashboard
 */
export function gerarRelatorioBioAge(idadeReal, dados) {
  const scoreObj = calcularScore(dados);
  const bioAge = calcularIdadeBiologica(idadeReal, scoreObj);
  const diff = idadeReal - bioAge;

  return {
    idadeCronologica: idadeReal,
    idadeBiologica: bioAge,
    diferencaAnos: Number(diff.toFixed(1)),
    scoreTotal: scoreObj.total,
    classificacao: diff > 3 ? 'EXCEPCIONAL' : diff > 1 ? 'OTIMO' : diff > 0 ? 'BOM' : diff > -2 ? 'ATENCAO' : 'CRITICO',
    fatores: scoreObj.detalhes,
    recomendacao: diff < 1 ? 'Priorizar sono e consistência de treino para aumentar o score.' : 'Manter protocolo atual. Foco em otimizar fatores mais fracos.',
  };
}
