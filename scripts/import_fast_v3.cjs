/**
 * REGENI — Import Fast v3 (unique IDs, no collisions)
 * Uses hash of evento+nome+distancia for unique result IDs
 * 
 * Usage: DATABASE_URL="postgresql://..." node import_fast_v3.cjs /tmp/hist_chunk_040.json
 *   or: node import_fast_v3.cjs --all  (imports all chunks)
 */
const { Client } = require('pg');
const fs = require('fs');
const crypto = require('crypto');

const DB = process.env.DATABASE_URL || 'postgresql://postgres:sBbOLYIKlSXCXTnLWnYRUTJVAzLUBhhF@caboose.proxy.rlwy.net:31475/railway';

function hash(s) { return crypto.createHash('md5').update(s).digest('hex').substring(0, 20); }
function esc(s) { return (s || '').replace(/'/g, "''").replace(/\\/g, '').substring(0, 200); }

async function importChunk(arquivo) {
  if (!fs.existsSync(arquivo)) { console.log('Not found:', arquivo); return 0; }
  
  const dados = JSON.parse(fs.readFileSync(arquivo));
  const validos = dados.filter(d => d.nome && d.tempo && d.tempo !== '00:00:00' && d.tempo.length >= 5);
  console.log(`📂 ${arquivo} — ${validos.length}/${dados.length} valid`);
  if (!validos.length) return 0;

  const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // 1. Races
  const raceMap = new Map();
  validos.forEach(d => {
    const key = hash(d.slug || d.eventoId || d.eventoNome || '');
    if (!raceMap.has(key)) {
      const parts = (d.eventoLocal || '').split('-').map(s => s.trim());
      raceMap.set(key, {
        id: 'cr2_' + key,
        name: esc(d.eventoNome || '').substring(0, 200),
        date: d.eventoData || '2020-01-01',
        city: esc(parts[0] || '').substring(0, 100),
        state: esc((parts[parts.length - 1] || '').substring(0, 2).toUpperCase()),
        dist: esc(d.distancia || '').substring(0, 50)
      });
    }
  });

  for (const [, r] of raceMap) {
    try {
      await client.query(`INSERT INTO "Race"(id,name,date,city,state,distances,organizer,status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,'Central de Resultados','completed',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`,
        [r.id, r.name, r.date, r.city, r.state, r.dist]);
    } catch {}
  }

  // 2. Athletes + Results in batches
  let ok = 0, skip = 0;
  for (let i = 0; i < validos.length; i += 200) {
    const batch = validos.slice(i, i + 200);
    
    for (const d of batch) {
      try {
        // Unique athlete ID based on name hash
        const nameNorm = (d.nome || '').toUpperCase().trim();
        const aid = 'a_' + hash(nameNorm + (d.genero || 'M'));
        
        await client.query(`INSERT INTO "Athlete"(id,name,gender,age,state,"totalRaces","totalPoints","createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,1,0,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`,
          [aid, nameNorm.substring(0, 200), (d.genero || 'M').substring(0, 1), parseInt(d.idade) || 0, (d.estado || '').substring(0, 2).toUpperCase()]);

        // Unique result ID based on evento+nome+distancia
        const raceKey = hash(d.slug || d.eventoId || d.eventoNome || '');
        const rid = 'r2_' + hash(raceKey + nameNorm + (d.distancia || ''));
        
        const res = await client.query(`INSERT INTO "Result"(id,"raceId","athleteId",time,pace,"overallRank","genderRank","ageGroup",distance,points,"createdAt") VALUES($1,$2,$3,$4,$5,$6,0,$7,$8,0,NOW()) ON CONFLICT(id) DO NOTHING`,
          ['r2_' + rid.substring(0, 75), 'cr2_' + raceKey, aid, (d.tempo || '').substring(0, 8), (d.pace || '').substring(0, 10), parseInt(d.pos) || 0, (d.faixa || '').substring(0, 50), (d.distancia || '').substring(0, 20)]);
        
        if (res.rowCount > 0) ok++;
        else skip++;
      } catch { skip++; }
    }
    
    process.stdout.write(`\r  ${ok} new, ${skip} skip (${i + batch.length}/${validos.length})`);
  }

  const total = await client.query('SELECT COUNT(*) FROM "Result"');
  console.log(`\n  ✅ ${ok} imported | DB total: ${total.rows[0].count}`);
  await client.end();
  return ok;
}

async function main() {
  if (process.argv.includes('--all')) {
    const chunks = fs.readdirSync('/tmp').filter(f => f.startsWith('hist_chunk_')).sort().map(f => '/tmp/' + f);
    console.log(`🚀 ${chunks.length} chunks to import\n`);
    let grand = 0;
    for (const chunk of chunks) {
      grand += await importChunk(chunk);
    }
    console.log(`\n🎉 TOTAL: ${grand} new results imported`);
  } else {
    const file = process.argv[2];
    if (!file) { console.log('Usage: node import_fast_v3.cjs <chunk.json> | --all'); return; }
    await importChunk(file);
  }
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
