/**
 * REGENI — Fast Chunk Importer (Central de Resultados)
 * Reads /tmp/hist_chunk_*.json and bulk inserts via raw SQL
 * 
 * Usage: DATABASE_URL="postgresql://..." node import_fast_v2.cjs /tmp/hist_chunk_001.json
 */
const { Client } = require('pg');
const fs = require('fs');
const DELAY = ms => new Promise(r => setTimeout(r, ms));

function esc(s) {
  if (!s) return '';
  return String(s).replace(/'/g, "''").replace(/\\/g, '\\\\').substring(0, 200);
}

async function main() {
  const arquivo = process.argv[2];
  if (!arquivo) { console.log('Usage: node import_fast_v2.cjs <chunk.json>'); process.exit(1); }
  if (!fs.existsSync(arquivo)) { console.log('File not found:', arquivo); process.exit(1); }

  console.log(`📂 Loading ${arquivo}...`);
  const dados = JSON.parse(fs.readFileSync(arquivo));
  const validos = dados.filter(d => d.nome && d.tempo && d.tempo !== '00:00:00' && d.tempo.length >= 5);
  console.log(`  Valid: ${validos.length} of ${dados.length}`);

  if (!validos.length) { console.log('  No valid records, skipping.'); return; }

  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:sBbOLYIKlSXCXTnLWnYRUTJVAzLUBhhF@caboose.proxy.rlwy.net:31475/railway';
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('  Connected to DB');

  // 1. Races - unique by slug
  const raceMap = new Map();
  validos.forEach(d => {
    const slug = d.slug || d.eventoId || 'unknown';
    if (!raceMap.has(slug)) {
      const parts = (d.eventoLocal || '').split('-').map(s => s.trim());
      raceMap.set(slug, {
        id: 'central_' + esc(slug).substring(0, 80),
        name: esc(d.eventoNome || '').substring(0, 200),
        date: d.eventoData || '2020-01-01',
        city: esc(parts[0] || '').substring(0, 100),
        state: esc((parts[parts.length - 1] || '').substring(0, 2).toUpperCase()),
        dist: esc(d.distancia || '').substring(0, 50)
      });
    }
  });

  const races = [...raceMap.values()];
  console.log(`  Races: ${races.length}`);

  // Batch insert races
  for (let i = 0; i < races.length; i += 100) {
    const batch = races.slice(i, i + 100);
    const vals = batch.map(r =>
      `('${r.id}','${r.name}','${r.date}','${r.city}','${r.state}','${r.dist}','Central de Resultados','completed',NOW(),NOW())`
    ).join(',');
    try {
      await client.query(`INSERT INTO "Race"(id,name,date,city,state,distances,organizer,status,"createdAt","updatedAt") VALUES ${vals} ON CONFLICT(id) DO NOTHING`);
    } catch(e) { /* ignore dupes */ }
  }
  console.log(`  Races inserted: ${races.length}`);

  // 2. Athletes - unique by normalized name
  const athleteMap = new Map();
  validos.forEach(d => {
    const norm = d.nome.replace(/[^a-zA-ZÀ-ú0-9]/g, '').toLowerCase().substring(0, 40);
    const aid = 'c_' + norm;
    if (!athleteMap.has(aid)) {
      athleteMap.set(aid, {
        id: aid,
        name: esc(d.nome).substring(0, 200),
        gender: (d.genero || 'M').substring(0, 1),
        age: parseInt(d.idade) || 0,
        state: esc((d.estado || '').substring(0, 2).toUpperCase()),
      });
    }
  });

  const athletes = [...athleteMap.values()];
  console.log(`  Athletes: ${athletes.length}`);

  for (let i = 0; i < athletes.length; i += 500) {
    const batch = athletes.slice(i, i + 500);
    const vals = batch.map(a =>
      `('${a.id}','${a.name}','${a.gender}',${a.age},'${a.state}','',1,0,NOW(),NOW())`
    ).join(',');
    try {
      await client.query(`INSERT INTO "Athlete"(id,name,gender,age,state,equipe,"totalRaces","totalPoints","createdAt","updatedAt") VALUES ${vals} ON CONFLICT(id) DO NOTHING`);
    } catch(e) { /* ignore */ }
    process.stdout.write(`\r  Athletes: ${Math.min(i + 500, athletes.length)}/${athletes.length}`);
  }
  console.log('');

  // 3. Results - batch insert
  let ok = 0, skip = 0;
  for (let i = 0; i < validos.length; i += 500) {
    const batch = validos.slice(i, i + 500);
    const vals = batch.map(d => {
      const norm = d.nome.replace(/[^a-zA-ZÀ-ú0-9]/g, '').toLowerCase().substring(0, 40);
      const aid = 'c_' + norm;
      const slug = d.slug || d.eventoId || 'unknown';
      const rid = 'cr_' + esc(slug).substring(0, 30) + '_' + aid.substring(0, 30) + '_' + esc(d.distancia || '').substring(0, 10);
      const tempo = esc(d.tempo || '').substring(0, 8);
      const pace = esc(d.pace || '').substring(0, 10);
      const faixa = esc(d.faixa || '').substring(0, 50);
      const dist = esc(d.distancia || '').substring(0, 20);
      const pos = parseInt(d.pos) || 0;
      return `('${rid.substring(0, 80)}','central_${esc(slug).substring(0, 80)}','${aid}','${tempo}','${pace}',${pos},0,'${faixa}','${dist}',0,NOW())`;
    }).join(',');

    try {
      const res = await client.query(`INSERT INTO "Result"(id,"raceId","athleteId",time,pace,"overallRank","genderRank","ageGroup",distance,points,"createdAt") VALUES ${vals} ON CONFLICT DO NOTHING`);
      ok += (res.rowCount || 0);
      skip += (batch.length - (res.rowCount || 0));
    } catch(e) {
      // Try one by one on error
      for (const d of batch) {
        try {
          const norm = d.nome.replace(/[^a-zA-ZÀ-ú0-9]/g, '').toLowerCase().substring(0, 40);
          const aid = 'c_' + norm;
          const slug = d.slug || d.eventoId || 'unknown';
          const rid = 'cr_' + esc(slug).substring(0, 30) + '_' + aid.substring(0, 30) + '_' + esc(d.distancia || '').substring(0, 10);
          await client.query(`INSERT INTO "Result"(id,"raceId","athleteId",time,pace,"overallRank","genderRank","ageGroup",distance,points,"createdAt") VALUES($1,$2,$3,$4,$5,$6,0,$7,$8,0,NOW()) ON CONFLICT DO NOTHING`,
            [rid.substring(0, 80), 'central_' + esc(slug).substring(0, 80), aid, (d.tempo || '').substring(0, 8), d.pace || '', parseInt(d.pos) || 0, (d.faixa || '').substring(0, 50), (d.distancia || '').substring(0, 20)]);
          ok++;
        } catch { skip++; }
      }
    }
    process.stdout.write(`\r  Results: ${ok} imported, ${skip} skipped (${i + batch.length}/${validos.length})`);
    if (i % 5000 === 0 && i > 0) await DELAY(200);
  }

  console.log('');

  // Final count
  const total = await client.query('SELECT COUNT(*) FROM "Result"');
  console.log(`\n✅ Done! Imported: ${ok} | Skipped: ${skip}`);
  console.log(`📊 BANCO TOTAL: ${total.rows[0].count} resultados`);

  await client.end();
}

main().catch(e => { console.error('❌ ERRO:', e.message); process.exit(1); });
