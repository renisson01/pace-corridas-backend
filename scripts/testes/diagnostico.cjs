const { Client } = require('pg');
const c = new Client({
  connectionString: 'postgresql://postgres:sBbOLYIKlSXCXTnLWnYRUTJVAzLUBhhF@caboose.proxy.rlwy.net:31475/railway'
});

c.connect().then(async () => {
  console.log('═══════════════════════════════════════');
  console.log('   DIAGNÓSTICO COMPLETO DO BANCO');
  console.log('═══════════════════════════════════════\n');

  // 1. Contagens gerais
  const counts = await c.query(`
    SELECT
      (SELECT COUNT(*) FROM "Race") as races,
      (SELECT COUNT(*) FROM "Result") as results,
      (SELECT COUNT(*) FROM "Athlete") as athletes,
      (SELECT COUNT(*) FROM "CorridaAberta") as abertas
  `);
  const ct = counts.rows[0];
  console.log('📊 CONTAGENS GERAIS:');
  console.log('  Race:', ct.races);
  console.log('  Result:', ct.results);
  console.log('  Athlete:', ct.athletes);
  console.log('  CorridaAberta:', ct.abertas);

  // 2. Resultados sem raceId
  const semRace = await c.query(`SELECT COUNT(*) FROM "Result" WHERE "raceId" IS NULL`);
  console.log('\n⚠️  Resultados sem raceId:', semRace.rows[0].count);

  // 3. Corridas sem resultado
  const raceSemResult = await c.query(`
    SELECT COUNT(*) FROM "Race" 
    WHERE id NOT IN (SELECT DISTINCT "raceId" FROM "Result" WHERE "raceId" IS NOT NULL)
  `);
  console.log('⚠️  Corridas sem nenhum resultado:', raceSemResult.rows[0].count);

  // 4. Top 10 corridas com mais resultados
  const top = await c.query(`
    SELECT r.name, r.date, r.state, COUNT(re.id) as total 
    FROM "Race" r 
    LEFT JOIN "Result" re ON re."raceId" = r.id 
    GROUP BY r.id, r.name, r.date, r.state 
    ORDER BY total DESC LIMIT 10
  `);
  console.log('\n🏆 TOP 10 CORRIDAS COM MAIS RESULTADOS:');
  top.rows.forEach(r => console.log(`  ${r.total} resultados - ${r.name} (${r.state}) ${r.date ? new Date(r.date).toLocaleDateString('pt-BR') : ''}`));

  // 5. Distribuição por estado
  const estados = await c.query(`
    SELECT state, COUNT(*) as corridas,
      (SELECT COUNT(*) FROM "Result" re JOIN "Race" r2 ON re."raceId"=r2.id WHERE r2.state=r.state) as resultados
    FROM "Race" r
    GROUP BY state ORDER BY corridas DESC
  `);
  console.log('\n📍 CORRIDAS E RESULTADOS POR ESTADO:');
  estados.rows.forEach(e => console.log(`  ${e.state || '??'}: ${e.corridas} corridas, ${e.resultados} resultados`));

  // 6. Amostra de resultados — ver se tempo/pace estão preenchidos
  const sample = await c.query(`
    SELECT re.time, re.pace, re.distance, re.overallRank, re.genderRank, re.ageGroup,
           a.name as atleta, r.name as corrida
    FROM "Result" re
    JOIN "Athlete" a ON a.id = re."athleteId"
    JOIN "Race" r ON r.id = re."raceId"
    LIMIT 5
  `);
  console.log('\n🔍 AMOSTRA DE RESULTADOS:');
  sample.rows.forEach(r => console.log(
    `  ${r.atleta} | ${r.corrida} | ${r.distance} | tempo:${r.time} | pace:${r.pace} | rank:${r.overallrank}`
  ));

  // 7. Campos nulos nos resultados
  const nulos = await c.query(`
    SELECT 
      COUNT(*) FILTER (WHERE time IS NULL) as sem_time,
      COUNT(*) FILTER (WHERE pace IS NULL) as sem_pace,
      COUNT(*) FILTER (WHERE overallRank IS NULL) as sem_rank,
      COUNT(*) FILTER (WHERE distance IS NULL) as sem_distance,
      COUNT(*) FILTER (WHERE "athleteId" IS NULL) as sem_athlete
    FROM "Result"
  `);
  console.log('\n❌ CAMPOS NULOS EM Result:');
  const n = nulos.rows[0];
  console.log('  Sem time:', n.sem_time);
  console.log('  Sem pace:', n.sem_pace);
  console.log('  Sem rank:', n.sem_rank);
  console.log('  Sem distance:', n.sem_distance);
  console.log('  Sem athleteId:', n.sem_athlete);

  // 8. Campos nulos nos atletas
  const atletaNulos = await c.query(`
    SELECT
      COUNT(*) FILTER (WHERE name IS NULL OR name='') as sem_nome,
      COUNT(*) FILTER (WHERE gender IS NULL) as sem_genero,
      COUNT(*) FILTER (WHERE "birthYear" IS NULL) as sem_nascimento
    FROM "Athlete"
  `);
  console.log('\n❌ CAMPOS NULOS EM Athlete:');
  const an = atletaNulos.rows[0];
  console.log('  Sem nome:', an.sem_nome);
  console.log('  Sem gênero:', an.sem_genero);
  console.log('  Sem ano nascimento:', an.sem_nascimento);

  // 9. Colunas de Athlete
  const colsA = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='Athlete' ORDER BY ordinal_position`);
  console.log('\n📋 Colunas de Athlete:', colsA.rows.map(r => r.column_name).join(', '));

  // 10. Amostra de atletas
  const atletas = await c.query(`SELECT * FROM "Athlete" LIMIT 3`);
  console.log('\n👤 AMOSTRA DE ATLETAS:');
  atletas.rows.forEach(a => console.log('  ', JSON.stringify(a)));

  console.log('\n═══════════════════════════════════════');
  console.log('   FIM DO DIAGNÓSTICO');
  console.log('═══════════════════════════════════════');

  await c.end();
}).catch(console.error);
