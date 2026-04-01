#!/usr/bin/env node
/**
 * Limpeza de distâncias: normaliza formatos e remove dados inválidos
 * Antes de rodar: DATABASE_URL=... node limpeza-distancias.cjs
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== LIMPEZA DE DISTÂNCIAS ===\n');

  // 1. NORMALIZAR DISTÂNCIAS
  const normalizations = {
    '5km': '5K',
    '5KM': '5K',
    '5': '5K',
    '10km': '10K',
    '10KM': '10K',
    '10': '10K',
    '21km': '21K',
    '21KM': '21K',
    '21': '21K',
    '42km': '42K',
    '42KM': '42K',
    '42': '42K',
    '15km': '15K',
    '15KM': '15K',
    '15': '15K',
  };

  console.log('📋 PASSO 1: Normalizando distâncias\n');

  let totalUpdated = 0;
  for (const [from, to] of Object.entries(normalizations)) {
    const count = await prisma.result.updateMany({
      where: { distance: from },
      data: { distance: to },
    });
    if (count.count > 0) {
      console.log(`  ${from.padEnd(10)} → ${to.padEnd(10)} : ${count.count} registros`);
      totalUpdated += count.count;
    }
  }
  console.log(`\n✅ Total normalizado: ${totalUpdated} registros\n`);

  // 2. LIMPAR TEMPOS 00:00:00 (DNS = Did Not Start/Finish)
  console.log('📋 PASSO 2: Marcar 00:00:00 como DNS (Did Not Start)\n');

  const dnsCount = await prisma.result.updateMany({
    where: { time: '00:00:00' },
    data: { time: 'DNS' },
  });
  console.log(`  Marcados como DNS: ${dnsCount.count} registros\n`);

  // 3. INVESTIGAR TEMPOS IMPOSSÍVEIS (< 13:30 em 5K)
  console.log('📋 PASSO 3: Investigando tempos impossíveis em 5K\n');

  function tempoParaSegundos(t) {
    if (!t) return 999999;
    const parts = t.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 999999;
  }

  const impossiveis = await prisma.result.findMany({
    where: {
      distance: '5K',
      time: { notIn: ['DNS', ''] },
    },
    select: {
      id: true,
      time: true,
      distance: true,
      race: { select: { name: true } },
      athlete: { select: { name: true } },
    },
  });

  const impossíveisFiltered = impossiveis.filter(
    (r) => tempoParaSegundos(r.time) > 0 && tempoParaSegundos(r.time) < 810
  );

  console.log(`  Tempos < 13:30 em 5K: ${impossíveisFiltered.length}\n`);

  if (impossíveisFiltered.length > 0) {
    console.log('  Amostra (primeiros 10):');
    impossíveisFiltered.slice(0, 10).forEach((r, i) => {
      console.log(
        `    ${(i + 1).toString().padStart(2)}. ${r.time.padEnd(10)} | ${r.athlete?.name?.substring(0, 30).padEnd(30)} | ${r.race?.name?.substring(0, 20)}`
      );
    });
    console.log(`\n  ⚠️ Esses tempos provavelmente são de distâncias menores (1K, 2K, kids)`);
    console.log(`  Sugestão: investigue a origem (talvez field distance trocado na origem)\n`);
  }

  // 4. VERIFICAR DISTRIBUIÇÃO DE TEMPOS
  console.log('📋 PASSO 4: Distribuição de tempos (pós-limpeza)\n');

  const results = await prisma.result.findMany({
    where: { distance: '5K' },
    select: { time: true },
  });

  function tempoCategoria(t) {
    const secs = tempoParaSegundos(t);
    if (t === 'DNS' || secs === 999999) return 'DNS/Inválido';
    if (secs < 810) return 'Impossível (<13:30)';
    if (secs < 900) return '13:30-15:00';
    if (secs < 1200) return '15:00-20:00';
    if (secs < 1500) return '20:00-25:00';
    if (secs < 1800) return '25:00-30:00';
    return '30:00+';
  }

  const dist = {
    'DNS/Inválido': 0,
    'Impossível (<13:30)': 0,
    '13:30-15:00': 0,
    '15:00-20:00': 0,
    '20:00-25:00': 0,
    '25:00-30:00': 0,
    '30:00+': 0,
  };

  results.forEach((r) => {
    const cat = tempoCategoria(r.time);
    dist[cat]++;
  });

  Object.entries(dist).forEach(([cat, count]) => {
    const pct = Math.round((count / results.length) * 100);
    console.log(`  ${cat.padEnd(25)} : ${count.toString().padStart(6)} (${pct}%)`);
  });

  console.log(`\n✅ LIMPEZA CONCLUÍDA\n`);
  console.log('Resumo:');
  console.log(`  - ${totalUpdated} distâncias normalizadas`);
  console.log(`  - ${dnsCount.count} tempos 00:00:00 marcados como DNS`);
  console.log(`  - ${impossíveisFiltered.length} tempos impossíveis identificados (verificar manualmente)`);
  console.log('\n⚠️ PRÓXIMAS AÇÕES:');
  console.log('  1. Investigar origem dos tempos impossíveis');
  console.log('  2. Considerar remover ou reclassificar registros DNS (desclassificados)');
  console.log('  3. Testar ranking /ranking/10k no celular\n');
}

main().catch((e) => {
  console.error('❌ ERRO:', e.message);
  process.exit(1);
});
