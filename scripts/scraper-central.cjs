#!/usr/bin/env node
/**
 * REGENI Scraper — Central de Resultados v4 BATCH SIMPLIFICADO
 * Usage: DATABASE_URL=... node scripts/scraper-central.cjs
 * Opcoes: --limit 50  (limitar eventos)
 *         --ano 2024  (filtrar por ano)
 */
const { PrismaClient } = require('@prisma/client');
const https = require('https');
const prisma = new PrismaClient();
const DELAY = ms => new Promise(r => setTimeout(r, ms));

const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i+1] : null; };
const ANO_FILTRO = getArg('--ano') || '';
const LIMIT = parseInt(getArg('--limit') || '9999');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = Object.entries(body).map(([k,v]) => k+'='+encodeURIComponent(String(v))).join('&');
    const req = https.request({
      hostname: 'centralderesultados.com.br', path, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'Mozilla/5.0'
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { reject(new Error('JSON invalido')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

function normDist(d) {
  if (!d) return '5K';
  const n = parseFloat(String(d));
  if (n >= 40) return '42K';
  if (n >= 20) return '21K';
  if (n >= 14) return '15K';
  if (n >= 9)  return '10K';
  if (n >= 7)  return '8K';
  if (n >= 4)  return '5K';
  if (n >= 2)  return '3K';
  if (n >= 1)  return '2K';
  return String(n) + 'K';
}

function fmtTime(raw) {
  if (!raw) return null;
  const p = raw.split(':');
  if (p.length !== 3) return null;
  const h = parseInt(p[0]), m = parseInt(p[1]), s = Math.floor(parseFloat(p[2]));
  if (isNaN(h)||isNaN(m)||isNaN(s)) return null;
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}

function calcPace(t, km) {
  if (!t || !km || km <= 0) return null;
  const p = t.split(':').map(Number);
  const secs = p[0]*3600 + p[1]*60 + p[2];
  if (!secs) return null;
  const ps = secs / km;
  return Math.floor(ps/60) + ':' + String(Math.round(ps%60)).padStart(2,'0');
}

function calcAge(dn) {
  if (!dn || dn.startsWith('1920')) return null;
  try { return new Date().getFullYear() - new Date(dn).getFullYear(); }
  catch { return null; }
}

function parseLocal(desc) {
  if (!desc) return { city: '', state: '' };
  const p = desc.split('-').map(s => s.trim());
  return { city: p[0]||'', state: (p[1]||'').slice(0,2).toUpperCase() };
}

async function batchAthletes(rows) {
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i+CHUNK);
    const vals = chunk.map((a, j) => {
      const id = 'cr3_' + (Date.now()+i+j).toString(36) + j;
      const nm = (a.name||'').replace(/'/g,"''").slice(0,200);
      const gd = a.gender ? "'"+a.gender+"'" : 'NULL';
      const st = (a.state||'').slice(0,2);
      const ag = (a.age && !isNaN(a.age)) ? a.age : 'NULL';
      return "('"+id+"','"+nm+"',"+gd+",'"+st+"',"+ag+",1,0,NOW(),NOW())";
    }).join(',');
    await prisma.$executeRawUnsafe(
      'INSERT INTO "Athlete"(id,name,gender,state,age,"totalRaces","totalPoints","createdAt","updatedAt") VALUES '+vals+' ON CONFLICT DO NOTHING'
    );
  }
}

async function batchResults(rows) {
  const CHUNK = 500;
  let total = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i+CHUNK);
    const vals = chunk.map((r, j) => {
      const id = 'cr3r_'+(Date.now()+i+j).toString(36)+j;
      const tm = r.time ? "'"+r.time+"'" : 'NULL';
      const pc = r.pace ? "'"+r.pace+"'" : 'NULL';
      const dt = r.distance ? "'"+r.distance+"'" : 'NULL';
      const ag = r.ageGroup ? "'"+String(r.ageGroup).replace(/'/g,"''").slice(0,50)+"'" : 'NULL';
      const or_ = r.overallRank || 'NULL';
      return "('"+id+"','"+r.athleteId+"','"+r.raceId+"',"+tm+","+pc+","+dt+","+ag+","+or_+",NULL,0,NOW(),NOW())";
    }).join(',');
    try {
      await prisma.$executeRawUnsafe(
        'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt","updatedAt") VALUES '+vals+' ON CONFLICT DO NOTHING'
      );
      total += chunk.length;
    } catch(e) {
      for (const r of chunk) {
        try {
          const id = 'cr3r_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
          await prisma.$executeRawUnsafe(
            'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt","updatedAt") VALUES (\''+id+'\',\''+r.athleteId+'\',\''+r.raceId+'\','+(r.time?'\''+r.time+'\'':'NULL')+','+(r.pace?'\''+r.pace+'\'':'NULL')+','+(r.distance?'\''+r.distance+'\'':'NULL')+',NULL,'+(r.overallRank||'NULL')+',NULL,0,NOW(),NOW()) ON CONFLICT DO NOTHING'
          );
          total++;
        } catch(_) {}
      }
    }
    process.stdout.write('\r  Inserindo: '+total+'/'+rows.length+'...');
  }
  return total;
}

async function main() {
  console.log('🏃 REGENI Scraper — Central de Resultados v4\n');
  console.log('📋 Buscando eventos...');

  const eventos = [];
  let pagina = 1;
  while (eventos.length < LIMIT) {
    const res = await post('/resultados/buscar-resultado', {
      txt: '', cidade: '', data: ANO_FILTRO, vData: '', nrPagina: pagina
    });
    if (!res.success || !res.data || !res.data.length) break;
    eventos.push(...res.data);
    const total = res.data[0].qt_total || 0;
    process.stdout.write('\r  Pagina '+pagina+': '+eventos.length+'/'+total+'...');
    if (eventos.length >= total || res.data.length < 10) break;
    pagina++;
    await DELAY(300);
  }

  const lista = eventos.slice(0, LIMIT);
  console.log('\n OK: '+lista.length+' eventos\n');

  let totalImported = 0;
  let eventosOk = 0;

  for (let ei = 0; ei < lista.length; ei++) {
    const ev = lista[ei];
    const numg = ev.numg_evento;
    const nome = (ev.nome_evento || 'Evento '+numg).slice(0,200);
    const { city, state } = parseLocal(ev.desc_local || '');
    const date = ev.data_evento ? new Date(ev.data_evento) : new Date();
    const qtAtletas = ev.qt_atletas || 0;

    process.stdout.write('\n['+(ei+1)+'/'+lista.length+'] '+nome.slice(0,40).padEnd(40)+' ('+numg+')');

    if (qtAtletas === 0) { process.stdout.write(' skip'); continue; }

    try {
      let race = await prisma.race.findFirst({
        where: { name: { contains: nome.slice(0,20), mode: 'insensitive' }, date }
      });

      if (!race) {
        race = await prisma.race.create({
          data: { name: nome, city, state, date, distances: '5K', organizer: 'Central de Resultados', status: 'completed' }
        });
        process.stdout.write(' NOVA');
      } else {
        process.stdout.write(' JA');
      }

      // Buscar resultados — API retorna tudo de uma vez
      const apiRes = await post('/resultados/buscar-resultado-evento', {
        evento: numg, evento_empresa: '', genero: '', distancia: 0, categoria: '', nome: '', nrPagina: 1
      });

      if (!apiRes.success || !apiRes.data || !apiRes.data.length) {
        process.stdout.write(' sem-dados');
        continue;
      }

      const raw = apiRes.data;
      process.stdout.write(' '+raw.length+'res');

      const validRows = [];
      const distSet = new Set();
      for (const r of raw) {
        const name = (r.ds_nome||'').trim().toUpperCase().replace(/\s+/g,' ');
        if (!name || name.length < 2 || name.includes('/')) continue;
        const time = fmtTime(r.tempo_liquido || r.tempo_total);
        if (!time || time === '00:00:00') continue;
        const gender = r.ds_genero === 'F' ? 'F' : r.ds_genero === 'M' ? 'M' : null;
        const dist = normDist(r.distancia);
        const km = parseFloat(r.distancia) || 5;
        distSet.add(dist);
        validRows.push({
          name, gender, time,
          pace: calcPace(time, km),
          age: calcAge(r.data_nascimento),
          state: state || '',
          distance: dist,
          ageGroup: r.ds_categoria || null,
          overallRank: r.colocacao ? parseInt(r.colocacao) : null,
        });
      }

      if (!validRows.length) { process.stdout.write(' nenhum-valido'); continue; }

      if (distSet.size > 0) {
        await prisma.race.update({ where: { id: race.id }, data: { distances: [...distSet].join(',') } });
      }

      await batchAthletes(validRows);

      const names = [...new Set(validRows.map(r => r.name))];
      const athleteMap = {};
      for (let i = 0; i < names.length; i += 500) {
        const found = await prisma.athlete.findMany({
          where: { name: { in: names.slice(i,i+500) } },
          select: { id: true, name: true }
        });
        for (const a of found) athleteMap[a.name] = a.id;
      }

      const resultRows = validRows
        .filter(r => athleteMap[r.name])
        .map(r => ({ ...r, athleteId: athleteMap[r.name], raceId: race.id }));

      const inserted = await batchResults(resultRows);
      totalImported += inserted;
      eventosOk++;
      process.stdout.write('\r  OK: '+inserted+' importados\n');
      await DELAY(200);

    } catch(e) {
      process.stdout.write('\n  ERRO: '+e.message+'\n');
    }
  }

  console.log('\n'+'='.repeat(50));
  console.log('TOTAL: '+totalImported+' resultados em '+eventosOk+' eventos');
  const [races, athletes, results] = await Promise.all([
    prisma.race.count(), prisma.athlete.count(), prisma.result.count()
  ]);
  console.log('Banco: '+races+' corridas | '+athletes+' atletas | '+results+' resultados');
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
