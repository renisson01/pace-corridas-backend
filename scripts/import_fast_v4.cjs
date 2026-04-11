/**
 * REGENI — Import v4 ULTRA FAST
 * Batch SQL: 500 per INSERT, ~50k/min
 * 
 * Usage: node import_fast_v4.cjs --all
 */
const { Client } = require('pg');
const fs = require('fs');
const crypto = require('crypto');

const DB = process.env.DATABASE_URL || 'postgresql://postgres:esjWowaYBBHymMehTZZiLSPjgkQSfDZW@maglev.proxy.rlwy.net:27005/railway';
function h(s) { return crypto.createHash('md5').update(s).digest('hex').substring(0, 20); }
function e(s) { return (s || '').replace(/'/g, "''").replace(/\\/g, '').replace(/\x00/g, '').substring(0, 200); }

async function importChunk(arquivo, client) {
  if (!fs.existsSync(arquivo)) return 0;
  const dados = JSON.parse(fs.readFileSync(arquivo));
  const validos = dados.filter(d => d.nome && d.tempo && d.tempo !== '00:00:00' && d.tempo.length >= 5);
  if (!validos.length) { console.log(`  ${arquivo}: 0 valid, skip`); return 0; }
  console.log(`📂 ${arquivo} — ${validos.length} valid`);

  // 1. Batch races
  const raceMap = new Map();
  validos.forEach(d => {
    const key = h(d.slug || d.eventoId || d.eventoNome || '');
    if (!raceMap.has(key)) {
      const parts = (d.eventoLocal || '').split('-').map(s => s.trim());
      raceMap.set(key, { id: 'cr3_' + key, name: e(d.eventoNome), date: d.eventoData || '2020-01-01', city: e(parts[0]).substring(0, 100), state: e((parts[parts.length - 1] || '').substring(0, 2).toUpperCase()) });
    }
  });
  
  const races = [...raceMap.values()];
  for (let i = 0; i < races.length; i += 50) {
    const batch = races.slice(i, i + 50);
    const vals = batch.map(r => `('${e(r.id)}','${e(r.name).substring(0,200)}','${r.date}','${e(r.city)}','${e(r.state)}','','Central de Resultados','completed',NOW(),NOW())`).join(',');
    await client.query(`INSERT INTO "Race"(id,name,date,city,state,distances,organizer,status,"createdAt","updatedAt") VALUES ${vals} ON CONFLICT(id) DO NOTHING`).catch(() => {});
  }

  // 2. Batch athletes
  const athMap = new Map();
  validos.forEach(d => {
    const nn = (d.nome || '').toUpperCase().trim();
    const aid = 'a3_' + h(nn + (d.genero || 'M'));
    if (!athMap.has(aid)) athMap.set(aid, { id: aid, name: e(nn).substring(0, 200), gender: (d.genero || 'M').substring(0, 1), age: parseInt(d.idade) || 0, state: e((d.estado || '').substring(0, 2).toUpperCase()) });
  });

  const athletes = [...athMap.values()];
  for (let i = 0; i < athletes.length; i += 300) {
    const batch = athletes.slice(i, i + 300);
    const vals = batch.map(a => `('${a.id}','${a.name}','${a.gender}',${a.age},'${a.state}','',1,0,NOW(),NOW())`).join(',');
    await client.query(`INSERT INTO "Athlete"(id,name,gender,age,state,equipe,"totalRaces","totalPoints","createdAt","updatedAt") VALUES ${vals} ON CONFLICT(id) DO NOTHING`).catch(() => {});
    process.stdout.write(`\r  Athletes: ${Math.min(i + 300, athletes.length)}/${athletes.length}`);
  }
  console.log('');

  // 3. Batch results - 500 per INSERT
  let ok = 0;
  for (let i = 0; i < validos.length; i += 500) {
    const batch = validos.slice(i, i + 500);
    const vals = batch.map(d => {
      const nn = (d.nome || '').toUpperCase().trim();
      const aid = 'a3_' + h(nn + (d.genero || 'M'));
      const rkey = h(d.slug || d.eventoId || d.eventoNome || '');
      const rid = 'r3_' + h(rkey + nn + (d.distancia || ''));
      return `('${rid}','cr3_${rkey}','${aid}','${e(d.tempo).substring(0, 8)}','${e(d.pace).substring(0, 10)}',${parseInt(d.pos) || 0},0,'${e(d.faixa).substring(0, 50)}','${e(d.distancia).substring(0, 20)}',0,NOW())`;
    }).join(',');
    
    try {
      const res = await client.query(`INSERT INTO "Result"(id,"raceId","athleteId",time,pace,"overallRank","genderRank","ageGroup",distance,points,"createdAt") VALUES ${vals} ON CONFLICT(id) DO NOTHING`);
      ok += (res.rowCount || 0);
    } catch (err) {
      // On error, try smaller batches
      for (let j = 0; j < batch.length; j += 50) {
        const mini = batch.slice(j, j + 50);
        const mvals = mini.map(d => {
          const nn = (d.nome || '').toUpperCase().trim();
          const aid = 'a3_' + h(nn + (d.genero || 'M'));
          const rkey = h(d.slug || d.eventoId || d.eventoNome || '');
          const rid = 'r3_' + h(rkey + nn + (d.distancia || ''));
          return `('${rid}','cr3_${rkey}','${aid}','${e(d.tempo).substring(0, 8)}','${e(d.pace).substring(0, 10)}',${parseInt(d.pos) || 0},0,'${e(d.faixa).substring(0, 50)}','${e(d.distancia).substring(0, 20)}',0,NOW())`;
        }).join(',');
        const r = await client.query(`INSERT INTO "Result"(id,"raceId","athleteId",time,pace,"overallRank","genderRank","ageGroup",distance,points,"createdAt") VALUES ${mvals} ON CONFLICT(id) DO NOTHING`).catch(() => ({ rowCount: 0 }));
        ok += (r.rowCount || 0);
      }
    }
    process.stdout.write(`\r  Results: ${ok} new (${i + batch.length}/${validos.length})`);
  }
  console.log('');
  return ok;
}

async function main() {
  const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to DB');

  const before = await client.query('SELECT COUNT(*) FROM "Result"');
  console.log(`DB before: ${before.rows[0].count} results\n`);

  if (process.argv.includes('--all')) {
    const chunks = fs.readdirSync('/tmp').filter(f => f.match(/^hist_chunk_\d+\.json$/)).sort().map(f => '/tmp/' + f);
    console.log(`🚀 ${chunks.length} chunks\n`);
    let grand = 0;
    for (const chunk of chunks) {
      grand += await importChunk(chunk, client);
    }
    const after = await client.query('SELECT COUNT(*) FROM "Result"');
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🎉 TOTAL NEW: ${grand}`);
    console.log(`📊 DB: ${before.rows[0].count} → ${after.rows[0].count} results`);
  } else {
    const file = process.argv[2];
    if (!file) { console.log('Usage: node import_fast_v4.cjs <chunk> | --all'); await client.end(); return; }
    await importChunk(file, client);
    const after = await client.query('SELECT COUNT(*) FROM "Result"');
    console.log(`📊 DB total: ${after.rows[0].count}`);
  }
  await client.end();
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
