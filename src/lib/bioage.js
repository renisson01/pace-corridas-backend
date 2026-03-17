
export function calcularScore(dados) {
  let score = 0;

  // SONO
  if (dados.horasSono >= 7) score += 20;
  else if (dados.horasSono >= 6) score += 15;
  else score += 8;

  // HRV
  if (dados.hrvMedia > 70) score += 20;
  else if (dados.hrvMedia > 50) score += 15;
  else score += 8;

  // FC REPOUSO
  if (dados.fcRepouso < 55) score += 15;
  else if (dados.fcRepouso < 65) score += 10;
  else score += 5;

  // GORDURA
  if (dados.gorduraPct < 15) score += 15;
  else if (dados.gorduraPct < 20) score += 10;
  else score += 5;

  // TREINO
  if (dados.treinouHoje) score += 15;

  // CONSISTÊNCIA
  if (dados.streak > 7) score += 15;
  else if (dados.streak > 3) score += 10;

  return Math.min(score, 100);
}

export function calcularIdadeBiologica(idadeReal, score) {
  return Number((idadeReal - ((score - 50) / 5)).toFixed(1));
}

