/**
 * REGENI — Pipeline Central de Resultados 2014-2023
 * 1. Scraper (background child)  → /tmp/hist_chunk_XXX.json
 * 2. Importer daemon             → importa chunks conforme aparecem
 * 3. Counter display             → conta DB a cada 2 min
 */
require('dotenv').config();
const { Client }  = require('pg');
const { spawn }   = require('child_process');
const fs          = require('fs');
const path        = require('path');
const crypto      = require('crypto');

const DB_URL = process.env.DATABASE_URL;
const START  = Date.now();
const BAR    = '═'.repeat(56);

function ts() {
  const s = Math.floor((Date.now() - START) / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${ss}`;
}
function log(msg) { process.stdout.write(`[${ts()}] ${msg}\n`); }

// ── importChunk (inline, sem arquivo externo) ─────────────────────────────────
function h(s) { return crypto.createHash('md5').update(String(s)).digest('hex').substring(0, 20); }
function e(s) { return (s || '').replace(/'/g, "''").replace(/\\/g, '').replace(/\x00/g, '').substring(0, 200); }

async function importChunk(arquivo, client) {
  if (!fs.existsSync(arquivo)) return 0;
  const dados = JSON.parse(fs.readFileSync(arquivo));
  const validos = dados.filter(d => d.nome && d.tempo && d.tempo !== '00:00:00' && d.tempo.length >= 5);
  if (!validos.length) return 0;

  // races
  const raceMap = new Map();
  validos.forEach(d => {
    const key = h(d.slug || d.eventoId || d.eventoNome || '');
    if (!raceMap.has(key)) {
      const parts = (d.eventoLocal || '').split('-').map(s => s.trim());
      raceMap.set(key, { id: 'cr3_' + key, name: e(d.eventoNome), date: d.eventoData || '2020-01-01', city: e(parts[0]).substring(0, 100), state: e((parts[parts.length - 1] || '').substring(0, 2).toUpperCase()) });
    }
  });
  for (let i = 0; i < [...raceMap.values()].length; i += 50) {
    const batch = [...raceMap.values()].slice(i, i + 50);
    const vals = batch.map(r => `('${e(r.id)}','${e(r.name).substring(0,200)}','${r.date}','${e(r.city)}','${e(r.state)}','','Central de Resultados','completed',NOW(),NOW())`).join(',');
    await client.query(`INSERT INTO "Race"(id,name,date,city,state,distances,organizer,status,"createdAt","updatedAt") VALUES ${vals} ON CONFLICT(id) DO NOTHING`).catch(() => {});
  }

  // athletes
  const athMap = new Map();
  validos.forEach(d => {
    const nn = (d.nome || '').toUpperCase().trim();
    const aid = 'a3_' + h(nn + (d.genero || 'M'));
    if (!athMap.has(aid)) athMap.set(aid, { id: aid, name: e(nn).substring(0, 200), gender: (d.genero || 'M').substring(0, 1), age: parseInt(d.idade) || 0, state: e((d.estado || '').substring(0, 2).toUpperCase()) });
  });
  for (let i = 0; i < [...athMap.values()].length; i += 300) {
    const batch = [...athMap.values()].slice(i, i + 300);
    const vals = batch.map(a => `('${a.id}','${a.name}','${a.gender}',${a.age},'${a.state}','',1,0,NOW(),NOW())`).join(',');
    await client.query(`INSERT INTO "Athlete"(id,name,gender,age,state,equipe,"totalRaces","totalPoints","createdAt","updatedAt") VALUES ${vals} ON CONFLICT(id) DO NOTHING`).catch(() => {});
  }

  // results
  let ok = 0;
  for (let i = 0; i < validos.length; i += 500) {
    const batch = validos.slice(i, i + 500);
    const vals = batch.map(d => {
      const nn = (d.nome || '').toUpperCase().trim();
      const aid = 'a3_' + h(nn + (d.genero || 'M'));
      const rkey = h(d.slug || d.eventoId || d.eventoNome || '');
      const rid = 'r3_' + h(rkey + nn + (d.distancia || ''));
      return `('${rid}','cr3_${rkey}','${aid}','${e(d.tempo).substring(0,8)}','${e(d.pace).substring(0,10)}',${parseInt(d.pos)||0},0,'${e(d.faixa).substring(0,50)}','${e(d.distancia).substring(0,20)}',0,NOW())`;
    }).join(',');
    try {
      const res = await client.query(`INSERT INTO "Result"(id,"raceId","athleteId",time,pace,"overallRank","genderRank","ageGroup",distance,points,"createdAt") VALUES ${vals} ON CONFLICT(id) DO NOTHING`);
      ok += (res.rowCount || 0);
    } catch {
      for (let j = 0; j < batch.length; j += 50) {
        const mini = batch.slice(j, j + 50);
        const mv = mini.map(d => {
          const nn = (d.nome || '').toUpperCase().trim();
          const aid = 'a3_' + h(nn + (d.genero || 'M'));
          const rkey = h(d.slug || d.eventoId || d.eventoNome || '');
          const rid = 'r3_' + h(rkey + nn + (d.distancia || ''));
          return `('${rid}','cr3_${rkey}','${aid}','${e(d.tempo).substring(0,8)}','${e(d.pace).substring(0,10)}',${parseInt(d.pos)||0},0,'${e(d.faixa).substring(0,50)}','${e(d.distancia).substring(0,20)}',0,NOW())`;
        }).join(',');
        const r = await client.query(`INSERT INTO "Result"(id,"raceId","athleteId",time,pace,"overallRank","genderRank","ageGroup",distance,points,"createdAt") VALUES ${mv} ON CONFLICT(id) DO NOTHING`).catch(() => ({ rowCount: 0 }));
        ok += (r.rowCount || 0);
      }
    }
  }
  return ok;
}

async function dbCount(client) {
  const r = await client.query('SELECT COUNT(*) FROM "Result"');
  return parseInt(r.rows[0].count);
}

function progressBar(current, target, width = 30) {
  const pct = Math.min(current / target, 1);
  const filled = Math.floor(pct * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `[${bar}] ${(pct * 100).toFixed(1)}%`;
}

async function main() {
  const META = 1_000_000;

  // ── DB client para contagem e importação ────────────────────────────────────
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const inicio = await dbCount(client);
  console.log(`\n${BAR}`);
  console.log(`  REGENI — Central de Resultados  2014→2023`);
  console.log(`${BAR}`);
  console.log(`  📊 Resultados agora  : ${inicio.toLocaleString('pt-BR')}`);
  console.log(`  🎯 Meta              : ${META.toLocaleString('pt-BR')}`);
  console.log(`  📈 Faltam            : ${(META - inicio).toLocaleString('pt-BR')}`);
  console.log(`${BAR}\n`);

  // ── Lança o scraper como processo filho ─────────────────────────────────────
  const scraperLog = fs.createWriteStream('/tmp/scraper-central.log', { flags: 'a' });
  const scraper = spawn('node', ['scripts/scraper-central-historico.cjs'], {
    cwd: path.resolve(__dirname),
    env: { ...process.env }
  });
  scraper.stdout.on('data', d => { process.stdout.write(d); scraperLog.write(d); });
  scraper.stderr.on('data', d => { process.stderr.write(d); scraperLog.write(d); });
  scraper.on('close', code => log(`🏁 Scraper encerrado (exit ${code})`));
  log('🚀 Scraper iniciado → /tmp/hist_chunk_XXX.json');

  // ── Importer daemon: importa chunks novos a cada 30s ────────────────────────
  const importados = new Set();
  let totalImportado = 0;

  async function importarNovosChunks() {
    try {
      const chunks = fs.readdirSync('/tmp')
        .filter(f => /^hist_chunk_\d+\.json$/.test(f))
        .map(f => '/tmp/' + f)
        .sort();
      for (const chunk of chunks) {
        if (importados.has(chunk)) continue;
        importados.add(chunk);
        log(`📥 Importando ${path.basename(chunk)}...`);
        const novo = await importChunk(chunk, client);
        totalImportado += novo;
        const total = await dbCount(client);
        log(`   ✅ +${novo.toLocaleString('pt-BR')} novos → total BD: ${total.toLocaleString('pt-BR')}`);
      }
    } catch (err) {
      log(`⚠️  Import daemon: ${err.message}`);
    }
  }

  setInterval(importarNovosChunks, 30_000);

  // ── Counter display: a cada 2 minutos ───────────────────────────────────────
  let ultimo = inicio;
  const counterLog = fs.createWriteStream('/tmp/counter-central.log', { flags: 'w' });

  setInterval(async () => {
    try {
      const total = await dbCount(client);
      const delta = total - ultimo;
      const ate1M = META - total;
      const linha = `[${ts()}] ${total.toLocaleString('pt-BR').padStart(9)} resultados  +${delta.toLocaleString('pt-BR').padStart(6)}/2min  faltam: ${ate1M > 0 ? ate1M.toLocaleString('pt-BR') : '✅ META BATIDA!'}`;
      const barra = progressBar(total, META);
      console.log('\n' + '─'.repeat(56));
      console.log(`  📊 ${linha}`);
      console.log(`  ${barra}`);
      console.log('─'.repeat(56));
      counterLog.write(linha + '\n');
      ultimo = total;
      if (total >= META) {
        console.log('\n🎉🎉🎉  1 MILHÃO DE RESULTADOS ATINGIDO!  🎉🎉🎉\n');
        counterLog.write('🎉 META 1.000.000 ATINGIDA!\n');
      }
    } catch (err) {
      log(`⚠️  Counter: ${err.message}`);
    }
  }, 2 * 60 * 1000);

  log('⏱️  Contador ativo (a cada 2 min) → /tmp/counter-central.log');
  log('📋 Log do scraper → /tmp/scraper-central.log\n');
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
