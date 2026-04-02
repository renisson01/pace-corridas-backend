#!/usr/bin/env node
/**
 * REGENI — Import results from PDF (parsed JSON)
 * 
 * USO:
 *   DATABASE_URL="..." node scripts/import-pdf-result.cjs <json_file> <race_name> <city> <state> <date> <distance>
 * 
 * Exemplo:
 *   DATABASE_URL="..." node scripts/import-pdf-result.cjs /tmp/bh2026.json "CORRIDA SUPERMERCADOS BH 2026" "Belo Horizonte" "MG" "2026-03-29" "17.8K"
 * 
 * O JSON deve ser um array: [{"nome":"...", "idade":30, "faixa":"M3034", "genero":"M", "equipe":"...", "tempo":"01:02:25", "pos":1}, ...]
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const fs = require('fs');

const SKIP_EQ = new Set(['NAO POSSUO','OUTROS','INDIVIDUAL','SEM EQUIPE','NAO TENHO','PARTICULAR','SEM ASSESSORIA','NENHUMA','AVULSO','NAO','SEM','NENHUM','CLUBE DE CORRIDA - INDIVIDUAL']);

function normFaixa(f) {
  if (!f) return null;
  const m = f.match(/[FM]?(\d{2})(\d{2})/);
  return m ? m[1]+'-'+m[2] : f;
}

function cleanEq(e) {
  if (!e || e.trim().length < 2) return null;
  if (SKIP_EQ.has(e.trim().toUpperCase())) return null;
  return e.trim();
}

async function main() {
  const [,, jsonFile, raceName, city, state, date, distance] = process.argv;
  
  if (!jsonFile || !raceName) {
    console.log('USO: node import-pdf-result.cjs <json> <nome_corrida> <cidade> <estado> <data> <distancia>');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  console.log(`📥 ${data.length} registros de ${jsonFile}`);

  let race = await p.race.findFirst({ where: { name: { contains: raceName.slice(0,25), mode: 'insensitive' } } });
  if (!race) {
    race = await p.race.create({ data: {
      name: raceName, city: city||'', state: state||'', 
      date: new Date(date||Date.now()),
      distances: distance||'10K', organizer: 'PDF Import', status: 'completed'
    }});
    console.log('✅ Corrida criada:', race.name);
  } else {
    console.log('ℹ️ Corrida já existe:', race.name);
  }

  let ok=0, skip=0;
  for (const r of data) {
    if (!r.nome || r.nome.length < 2) { skip++; continue; }
    const nome = r.nome.toUpperCase().trim();
    const genero = r.genero || r.gender || null;
    const eq = cleanEq(r.equipe);
    const faixa = normFaixa(r.faixa);

    try {
      let ath = await p.athlete.findFirst({ where: { name: nome, gender: genero || undefined } });
      if (!ath) {
        ath = await p.athlete.create({ data: {
          name: nome, gender: genero, equipe: eq, state: state||null,
          age: r.idade||null, totalRaces: 1, totalPoints: 0
        }});
      } else {
        await p.athlete.update({ where: { id: ath.id }, data: { totalRaces: { increment: 1 } } });
      }
      const exists = await p.result.findUnique({ where: { athleteId_raceId: { athleteId: ath.id, raceId: race.id } } });
      if (exists) { skip++; continue; }
      await p.result.create({ data: {
        athleteId: ath.id, raceId: race.id, time: r.tempo,
        distance: distance||'10K', ageGroup: faixa, overallRank: r.pos||null, points: 0
      }});
      ok++;
      if (ok % 100 === 0) console.log(`   ✅ ${ok}...`);
    } catch(e) {
      if (e.code === 'P2002') { skip++; continue; }
    }
  }
  console.log(`✅ FINAL: ${ok} importados | ${skip} ignorados`);
  const [races, athletes, results] = await Promise.all([p.race.count(), p.athlete.count(), p.result.count()]);
  console.log(`📊 Banco: ${races} corridas, ${athletes} atletas, ${results} resultados`);
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
