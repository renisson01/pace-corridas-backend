const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const PONTOS_GERAL = { 1: 20, 2: 16, 3: 14, 4: 12, 5: 10 };
const PONTOS_FAIXA = { 1: 6, 2: 4, 3: 2 };
async function recalcular() {
  const races = await prisma.race.findMany({ include: { _count: { select: { results: true } } } });
  console.log(races.length + ' corridas');
  for (const race of races) {
    if (race._count.results === 0) continue;
    console.log('Recalculando: ' + race.name + ' (' + race._count.results + ' resultados)');
    const dists = await prisma.result.findMany({ where: { raceId: race.id }, select: { distance: true }, distinct: ['distance'] });
    for (const { distance } of dists) {
      console.log('  Dist: ' + distance);
      const results = await prisma.result.findMany({ where: { raceId: race.id, distance }, include: { athlete: true }, orderBy: { time: 'asc' } });
      const atletasGeral = new Set();
      const byGender = {};
      results.forEach(r => { const g = r.athlete.gender || 'X'; if (!byGender[g]) byGender[g] = []; byGender[g].push(r); });
      for (const list of Object.values(byGender)) {
        list.forEach((r, i) => { r.genderRank = i + 1; const pts = PONTOS_GERAL[i + 1]; if (pts) { r.points = pts + 1; atletasGeral.add(r.athleteId); } else { r.points = 1; } });
      }
      let rank = 0;
      results.forEach(r => { rank++; r.overallRank = rank; });
      const byAge = {};
      results.forEach(r => { const g = r.ageGroup || 'GERAL'; if (!byAge[g]) byAge[g] = []; byAge[g].push(r); });
      for (const list of Object.values(byAge)) {
        let pos = 0;
        for (const r of list) { if (!atletasGeral.has(r.athleteId)) { pos++; const pts = PONTOS_FAIXA[pos]; if (pts) r.points = pts + 1; } }
      }
      for (const r of results) { await prisma.result.update({ where: { id: r.id }, data: { overallRank: r.overallRank, genderRank: r.genderRank, points: r.points } }); }
    }
  }
  const athletes = await prisma.athlete.findMany({ include: { results: { select: { points: true } } } });
  let u = 0;
  for (const a of athletes) { const t = a.results.reduce((s, r) => s + (r.points || 0), 0); await prisma.athlete.update({ where: { id: a.id }, data: { totalPoints: t, totalRaces: a.results.length } }); u++; }
  console.log(u + ' atletas atualizados');
  console.log('Recalculo completo!');
}
recalcular().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1); });
