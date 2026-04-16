/**
 * atleta-badge.js — helpers do badge Premium » REGENI
 */

/** Retorna o HTML do badge ou '' se não for premium */
export function regeniBadge(isPremium) {
  if (!isPremium) return '';
  return '<span class="rg-badge-premium">REGENI</span>';
}

/** Retorna o nome + badge inline */
export function athleteNameWithBadge(name, isPremium) {
  return name + regeniBadge(isPremium);
}
