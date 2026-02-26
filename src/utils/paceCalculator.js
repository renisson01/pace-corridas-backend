
export function calcPace(time, distance) {
  if(!time || !distance) return '0:00';
  try {
    const d = parseFloat(String(distance).replace('km','').replace(',','.'));
    const p = String(time).split(':').map(Number);
    let s = p.length===3 ? p[0]*3600+p[1]*60+p[2] : p[0]*60+p[1];
    const pm = Math.floor(s/d/60), ps = Math.round((s/d)%60);
    return pm+':'+(String(ps).padStart(2,'0'));
  } catch { return '0:00'; }
}

export function paceToSeconds(pace) {
  if(!pace) return 0;
  const [m,s] = pace.split(':').map(Number);
  return m*60+(s||0);
}

export function timeToSeconds(time) {
  if(!time) return 0;
  const p = time.split(':').map(Number);
  return p.length===3 ? p[0]*3600+p[1]*60+p[2] : p[0]*60+p[1];
}

export function secondsToTime(s) {
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  const sec = s%60;
  return h>0
    ? h+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0')
    : m+':'+String(sec).padStart(2,'0');
}
