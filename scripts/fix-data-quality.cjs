#!/usr/bin/env node
/**
 * REGENI — Fix data quality issues
 * Run: DATABASE_URL=... node scripts/fix-data-quality.cjs
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== REGENI DATA QUALITY FIX ===\n');

  // 1. Fix state 'BR' → null (23K athletes)
  const fixBR = await prisma.athlete.updateMany({
    where: { state: 'BR' },
    data: { state: null }
  });
  console.log('1. State BR → null:', fixBR.count);

  // 2. Fix city 'NE' → null on races
  const fixNE = await prisma.race.updateMany({
    where: { city: 'NE' },
    data: { city: '' }
  });
  console.log('2. City NE → vazio:', fixNE.count);

  // 3. Remove impossible 5K times (< 13:30 = world record is 12:35)
  // Mark as DNS instead of delete
  const fix5k = await prisma.$executeRaw`
    UPDATE "Result" SET "time" = 'DNS'
    WHERE distance = '5K' AND "time" < '00:12:00' AND "time" != 'DNS' AND "time" != '' AND "time" != '00:00:00'`;
  console.log('3. 5K tempos impossíveis (<12:00) → DNS:', fix5k);

  // 4. Fix equipe 'NAO POSSUO' and 'OUTROS' → null
  const fixEquipe1 = await prisma.athlete.updateMany({
    where: { equipe: 'NAO POSSUO' },
    data: { equipe: null }
  });
  const fixEquipe2 = await prisma.athlete.updateMany({
    where: { equipe: 'OUTROS' },
    data: { equipe: null }
  });
  console.log('4. Equipe NAO POSSUO → null:', fixEquipe1.count);
  console.log('   Equipe OUTROS → null:', fixEquipe2.count);

  // 5. Fix athlete with empty name
  const fixName = await prisma.athlete.updateMany({
    where: { OR: [{ name: '' }, { name: null }] },
    data: { name: 'ATLETA DESCONHECIDO' }
  });
  console.log('5. Atletas sem nome fixados:', fixName.count);

  // 6. Fix ageGroup formats (F3539 → 35-39, M3034 → 30-34)
  const ageGroups = await prisma.$queryRaw`
    SELECT DISTINCT "ageGroup" FROM "Result" WHERE "ageGroup" IS NOT NULL AND "ageGroup" != ''`;
  
  let ageFixed = 0;
  for (const ag of ageGroups) {
    const g = ag.ageGroup;
    // Pattern: F3539, M3034, etc → 35-39, 30-34
    const match = g.match(/^[FM](\d{2})(\d{2})$/);
    if (match) {
      const newAge = match[1] + '-' + match[2];
      const result = await prisma.result.updateMany({
        where: { ageGroup: g },
        data: { ageGroup: newAge }
      });
      ageFixed += result.count;
    }
  }
  console.log('6. Faixas etárias normalizadas:', ageFixed);

  // 7. Normalize distance variants
  const distFixes = {
    '2.5K': '2.5K', '2,5': '2.5K', '2.5': '2.5K',
    '4km': '4K', '18km': '18K', '24KM': '24K',
    '28km': '28K', '32km': '32K', '54km': '54K'
  };
  let distFixed = 0;
  for (const [from, to] of Object.entries(distFixes)) {
    if (from === to) continue;
    const r = await prisma.result.updateMany({ where: { distance: from }, data: { distance: to } });
    distFixed += r.count;
  }
  console.log('7. Distâncias extras normalizadas:', distFixed);

  console.log('\n✅ DATA QUALITY FIX COMPLETE');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
