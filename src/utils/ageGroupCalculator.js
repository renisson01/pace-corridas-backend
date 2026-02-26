
export function getAgeGroup(age, type='10') {
  if(!age || age <= 0) return 'Geral';
  if(type === '5') {
    if(age < 20) return 'Sub-20';
    if(age <= 24) return '20-24';
    if(age <= 29) return '25-29';
    if(age <= 34) return '30-34';
    if(age <= 39) return '35-39';
    if(age <= 44) return '40-44';
    if(age <= 49) return '45-49';
    if(age <= 54) return '50-54';
    if(age <= 59) return '55-59';
    if(age <= 64) return '60-64';
    return '65+';
  }
  // tipo 10
  if(age < 20) return 'Sub-20';
  if(age <= 29) return '20-29';
  if(age <= 39) return '30-39';
  if(age <= 49) return '40-49';
  if(age <= 59) return '50-59';
  if(age <= 69) return '60-69';
  return '70+';
}

export function getAgeGroups(type='10') {
  if(type==='5') return ['Sub-20','20-24','25-29','30-34','35-39','40-44','45-49','50-54','55-59','60-64','65+'];
  return ['Sub-20','20-29','30-39','40-49','50-59','60-69','70+'];
}

// Pontuação PACE
export const POINTS_GENERAL = [100,85,75,65,55,48,42,37,33,30,27,24,21,18,16,14,12,10,9,8,7,6,5,4,3,2,1];
export const POINTS_AGE     = [40,30,20,15,10,8,6,4,2,1];

export function calcPoints(overallRank, ageGroupRank, ageGroup) {
  let pts = 0;
  if(overallRank>0 && overallRank<=POINTS_GENERAL.length) pts+=POINTS_GENERAL[overallRank-1];
  if(ageGroupRank>0 && ageGroupRank<=POINTS_AGE.length && ageGroup && ageGroup!=='Geral') pts+=POINTS_AGE[ageGroupRank-1];
  return pts;
}
