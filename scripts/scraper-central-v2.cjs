#!/usr/bin/env node
/**
 * REGENI — Central de Resultados SCRAPER v2
 * Simples, sem loops, sem paginacao complexa
 * Usage: DATABASE_URL=... node scraper-central-v2.cjs [--limit N] [--start N]
 */
const { Client } = require('pg');
const https = require('https');

const DB_URL = process.env.DATABASE_URL;
const args = process.argv.slice(2);
const getArg = n => { const i = args.indexOf(n); return i >= 0 ? args[i+1] : null; };
const LIMIT = parseInt(getArg('--limit') || '9999');
const START = parseInt(getArg('--start') || '0');
const DELAY = ms => new Promise(r => setTimeout(r, ms));

// HTTP com fetch nativo + timeout
async function post(path, body) {
  const data = Object.entries(body).map(([k,v]) => k+'='+encodeURIComponent(String(v))).join('&');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40000);
  try {
    const res = await fetch('https://centralderesultados.com.br' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
      body: data,
      signal: ctrl.signal
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function normDist(d) {
  const n = parseFloat(String(d||'5'));
  if (n >= 40) return '42K';
  if (n >= 20) return '21K';
  if (n >= 14) return '15K';
  if (n >= 9)  return '10K';
  if (n >= 7)  return '8K';
  if (n >= 4)  return '5K';
  if (n >= 2)  return '3K';
  return '2K';
}

function fmtTime(raw) {
  if (!raw) return null;
  const p = raw.split(':');
  if (p.length !== 3) return null;
  const h = parseInt(p[0]), m = parseInt(p[1]), s = Math.floor(parseFloat(p[2]));
  if (isNaN(h)||isNaN(m)||isNaN(s)) return null;
  if (h === 0 && m === 0 && s === 0) return null;
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}

function calcPace(t, km) {
  if (!t || !km || km <= 0) return null;
  const [h,m,s] = t.split(':').map(Number);
  const secs = h*3600+m*60+s;
  if (!secs) return null;
  const ps = secs/km;
  return Math.floor(ps/60)+':'+String(Math.round(ps%60)).padStart(2,'0');
}

function esc(s) { return String(s||'').replace(/'/g,"''"); }

async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  console.log('Conectado ao banco\n');

  // Buscar todos os eventos de uma vez (todas as paginas)
  console.log('Buscando lista de eventos...');
  const todos = [];
  for (let p = 1; p <= 100; p++) {
    const res = await post('/resultados/buscar-resultado', { txt:'', cidade:'', data:'', vData:'', nrPagina: p });
    if (!res.success || !res.data || !res.data.length) break;
    todos.push(...res.data);
    const total = res.data[0].qt_total || 0;
    process.stdout.write('\r  Pag '+p+': '+todos.length+'/'+total);
    if (todos.length >= total) break;
    await DELAY(200);
  }
  console.log('\nTotal: '+todos.length+' eventos\n');

  const lista = todos.slice(START, START + LIMIT);
  let totalImported = 0;

  for (let ei = 0; ei < lista.length; ei++) {
    const ev = lista[ei];
    const numg = ev.numg_evento;
    const nome = esc((ev.nome_evento||'Evento '+numg).slice(0,200));
    const local = (ev.desc_local||'').split('-').map(s=>s.trim());
    const city = esc(local[0]||'');
    const state = (local[1]||'').slice(0,2).toUpperCase();
    const date = ev.data_evento ? ev.data_evento.slice(0,10) : '2024-01-01';
    const qtAtletas = ev.qt_atletas || 0;

    process.stdout.write('\n['+(ei+1)+'/'+lista.length+'] '+ev.nome_evento.slice(0,40).padEnd(40)+' ('+numg+')');

    if (qtAtletas === 0) { process.stdout.write(' skip'); continue; }

    try {
      // Criar corrida se nao existe
      const raceCheck = await db.query(
        'SELECT id FROM "Race" WHERE name ILIKE $1 AND date::date = $2 LIMIT 1',
        ['%'+ev.nome_evento.slice(0,20).replace(/%/g,'')+'%', date]
      );

      let raceId;
      if (raceCheck.rows.length > 0) {
        raceId = raceCheck.rows[0].id;
        process.stdout.write(' JA');
      } else {
        const rid = 'cr3_'+Date.now().toString(36);
        await db.query(
          'INSERT INTO "Race"(id,name,city,state,date,distances,organizer,status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())',
          [rid, ev.nome_evento.slice(0,200), city, state, date, '5K', 'Central de Resultados', 'completed']
        );
        raceId = rid;
        process.stdout.write(' NOVA');
      }

      // Buscar resultados
      const apiRes = await post('/resultados/buscar-resultado-evento', {
        evento: numg, evento_empresa: '', genero: '', distancia: 0, categoria: '', nome: '', nrPagina: 1
      });

      if (!apiRes.success || !apiRes.data || !apiRes.data.length) {
        process.stdout.write(' sem-dados'); continue;
      }

      const raw = apiRes.data;
      process.stdout.write(' '+raw.length+'r');

      // Preparar dados
      const validos = [];
      for (const r of raw) {
        const name = (r.ds_nome||'').trim().toUpperCase().replace(/\s+/g,' ');
        if (!name || name.length < 2 || name.includes('/')) continue;
        const time = fmtTime(r.tempo_liquido || r.tempo_total);
        if (!time) continue;
        const gender = r.ds_genero === 'F' ? 'F' : r.ds_genero === 'M' ? 'M' : null;
        const dist = normDist(r.distancia);
        const km = parseFloat(r.distancia) || 5;
        const age = (r.data_nascimento && !r.data_nascimento.startsWith('1920'))
          ? new Date().getFullYear() - new Date(r.data_nascimento).getFullYear()
          : null;
        validos.push({ name, gender, time, pace: calcPace(time,km), age, dist, km,
          ageGroup: r.ds_categoria||null, rank: r.colocacao?parseInt(r.colocacao):null });
      }

      if (!validos.length) { process.stdout.write(' 0validos'); continue; }

      // Batch INSERT atletas
      const CHUNK = 200;
      for (let i = 0; i < validos.length; i += CHUNK) {
        const chunk = validos.slice(i, i+CHUNK);
        const vals = chunk.map((a,j) => {
          const id = 'cr3_'+(Date.now()+i+j).toString(36)+j;
          const g = a.gender ? "'"+a.gender+"'" : 'NULL';
          const ag = a.age ? a.age : 'NULL';
          return "('"+id+"','"+esc(a.name)+"',"+g+",'"+state+"',"+ag+",1,0,NOW(),NOW())";
        }).join(',');
        await db.query('INSERT INTO "Athlete"(id,name,gender,state,age,"totalRaces","totalPoints","createdAt","updatedAt") VALUES '+vals+' ON CONFLICT DO NOTHING');
      }

      // Buscar IDs dos atletas
      const names = [...new Set(validos.map(r=>r.name))];
      const athleteMap = {};
      for (let i = 0; i < names.length; i += 200) {
        const chunk = names.slice(i,i+200);
        const placeholders = chunk.map((_,j) => '$'+(j+1)).join(',');
        const found = await db.query('SELECT id,name FROM "Athlete" WHERE name IN ('+placeholders+')', chunk);
        for (const a of found.rows) athleteMap[a.name] = a.id;
      }

      // Batch INSERT resultados
      let imported = 0;
      const resultRows = validos.filter(r => athleteMap[r.name]);
      for (let i = 0; i < resultRows.length; i += CHUNK) {
        const chunk = resultRows.slice(i, i+CHUNK);
        const vals = chunk.map((r,j) => {
          const id = 'cr3r_'+(Date.now()+i+j).toString(36)+j;
          const aid = athleteMap[r.name];
          const tm = r.time ? "'"+r.time+"'" : 'NULL';
          const pc = r.pace ? "'"+r.pace+"'" : 'NULL';
          const ag = r.ageGroup ? "'"+esc(r.ageGroup).slice(0,50)+"'" : 'NULL';
          const rk = r.rank || 'NULL';
          return "('"+id+"','"+aid+"','"+raceId+"',"+tm+","+pc+",'"+r.dist+"',"+ag+","+rk+",NULL,0,NOW(),NOW())";
        }).join(',');
        try {
          await db.query('INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt","updatedAt") VALUES '+vals+' ON CONFLICT DO NOTHING');
          imported += chunk.length;
        } catch(e) {
          // fallback individual
          for (const r of chunk) {
            try {
              const id = 'cr3r_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
              const aid = athleteMap[r.name];
              await db.query(
                'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,0,NOW(),NOW()) ON CONFLICT DO NOTHING',
                [id, aid, raceId, r.time, r.pace, r.dist, r.ageGroup, r.rank]
              );
              imported++;
            } catch(_) {}
          }
        }
      }

      totalImported += imported;
      process.stdout.write(' => '+imported+' ok');
      await DELAY(150);

    } catch(e) {
      process.stdout.write(' ERRO:'+e.message.slice(0,40));
    }
  }

  console.log('\n\nTOTAL IMPORTADO: '+totalImported);
  const r = await db.query('SELECT (SELECT COUNT(*) FROM "Race") as c, (SELECT COUNT(*) FROM "Athlete") as a, (SELECT COUNT(*) FROM "Result") as r');
  console.log('Banco: '+r.rows[0].c+' corridas | '+r.rows[0].a+' atletas | '+r.rows[0].r+' resultados');
  await db.end();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
