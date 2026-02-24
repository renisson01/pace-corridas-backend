export function calculatePace(timeString, distanceKm) {
  const [hours, minutes, seconds] = timeString.split(':').map(Number);
  const totalMinutes = (hours * 60) + minutes + (seconds / 60);
  const paceMinutes = totalMinutes / distanceKm;
  const min = Math.floor(paceMinutes);
  const sec = Math.round((paceMinutes - min) * 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function getAgeGroup(age, gender) {
  const groups = [
    { min: 0, max: 17, label: 'SUB18' },
    { min: 18, max: 24, label: '18-24' },
    { min: 25, max: 29, label: '25-29' },
    { min: 30, max: 34, label: '30-34' },
    { min: 35, max: 39, label: '35-39' },
    { min: 40, max: 44, label: '40-44' },
    { min: 45, max: 49, label: '45-49' },
    { min: 50, max: 54, label: '50-54' },
    { min: 55, max: 59, label: '55-59' },
    { min: 60, max: 999, label: '60+' }
  ];
  const group = groups.find(g => age >= g.min && age <= g.max);
  return `${gender}${group.label}`;
}
