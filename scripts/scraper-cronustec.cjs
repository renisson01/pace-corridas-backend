#!/usr/bin/env node
/**
 * REGENI — Scraper SportsChrono CLAX
 * Busca eventos CLAX do sportschrono.com.br e importa resultados
 */
const { Client } = require('pg');
const fs = require('fs');

const DB_URL = process.env.DATABASE_URL;
const BASE = 'https://www.cronusteccorridas.com.br/resultados';
const DELAY = ms => new Promise(r => setTimeout(r, ms));

// Lista de eventos CLAX do SportsChrono
const EVENTOS = fs.readFileSync('/tmp/cronustec_slugs.txt','utf8').split('\n').map(s=>s.trim()).filter(Boolean);

function parseClax(xml) {
  const athletes = [];
  const engageRegex = /<E ([^>]+)\/>/g;
  const resultRegex = /<R ([^>]+)\/>/g;
  const attrRegex = /(\w+)="([^"]*)"/g;

  const parseAttrs = (str) => {
    const obj = {};
    let m;
    while ((m = attrRegex.exec(str)) !== null) obj[m[1]] = m[2];
    return obj;
  };

  // Parse engajados
  const engMap = {};
  let m;
  while ((m = engageRegex.exec(xml)) !== null) {
    const a = parseAttrs(m[1]);
    if (a.d && a.n) engMap[a.d] = a;
  }

  // Parse resultados
  while ((m = resultRegex.exec(xml)) !== null) {
    const r = parseAttrs(m[1]);
    const eng = engMap[r.d];
    if (!eng || !r.t || r.t === 'Desqualificado') continue;

    // Converter tempo hh'mm'ss,ms → HH:MM:SS
    const tMatch = r.t.match(/(\d+)h(\d+)'(\d+)/);
    if (!tMatch) continue;
    const time = `${tMatch[1].padStart(2,'0')}:${tMatch[2].padStart(2,'0')}:${tMatch[3].padStart(2,'0')}`;
    if (time === '00:00:00') continue;

    const name = (eng.n || '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (!name || name.length < 3) continue;

    athletes.push({
      name,
      gender: eng.x === 'F' ? 'F' : eng.x === 'M' ? 'M' : null,
      time,
      state: (eng.ip4 || 'SE').slice(0, 2).toUpperCase(),
      ageGroup: eng.ca || null,
      birthYear: eng.a ? parseInt(eng.a) : null,
      birthDate: eng.dn ? eng.dn : null,
    });
  }

  return athletes;
}

function normDist(xml) {
  const m = xml.match(/distance="(\d+)"/);
  if (!m) return '5K';
  const km = parseInt(m[1]) / 1000;
  if (km >= 40) return '42K';
  if (km >= 20) return '21K';
  if (km >= 14) return '15K';
  if (km >= 12) return '12K';
  if (km >= 9)  return '10K';
  if (km >= 7.5) return '8K';
  if (km >= 6.5) return '7K';
  if (km >= 5.5) return '6K';
  if (km >= 4)  return '5K';
  return '3K';
}

function calcPace(time, dist) {
  if (!time || !dist) return null;
  const km = parseFloat(dist);
  if (!km) return null;
  const [h, m, s] = time.split(':').map(Number);
  const sec = h * 3600 + m * 60 + s;
  if (!sec) return null;
  const ps = sec / km;
  return Math.floor(ps / 60) + ':' + String(Math.round(ps % 60)).padStart(2, '0');
}

function esc(s) { return String(s || '').replace(/'/g, "''"); }

async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  console.log('Conectado!\n');

  let totalImported = 0;
  let totalSkip = 0;

  for (let ei = 0; ei < EVENTOS.length; ei++) {
    const slug = EVENTOS[ei];
    const url = `${BASE}/${slug}`;
    const nomeParts = slug.split('/');
    const nomeEvento = nomeParts[nomeParts.length - 2].replace(/-/g, ' ');
    const ano = nomeParts[1];

    process.stdout.write(`\n[${ei + 1}/${EVENTOS.length}] ${nomeEvento} (${ano})`);

    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) { process.stdout.write(' 404-skip'); totalSkip++; continue; }
      const xml = await res.text();

      if (!xml.includes('<Epreuve')) { process.stdout.write(' sem-dados'); totalSkip++; continue; }

      // Data do evento
      const dateMatch = xml.match(/dates="[^,]+, (\d+) de (\w+) de (\d+)"/);
      const meses = { janeiro: '01', fevereiro: '02', março: '03', abril: '04', maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12' };
      let date = `${ano}-01-01`;
      if (dateMatch) {
        const mes = meses[dateMatch[2].toLowerCase()] || '01';
        date = `${dateMatch[3]}-${mes}-${dateMatch[1].padStart(2, '0')}`;
      }

      const dist = normDist(xml);
      const distKm = { '42K':42,'21K':21,'15K':15,'12K':12,'10K':10,'8K':8,'7K':7,'6K':6,'5K':5,'3K':3 }[dist] || null;

      // Verificar se já existe
      const existing = await db.query(
        'SELECT id FROM "Race" WHERE name ILIKE $1 LIMIT 1',
        ['%' + nomeEvento.slice(0, 20) + '%']
      );

      let raceId;
      if (existing.rows.length) {
        raceId = existing.rows[0].id;
        const chk = await db.query('SELECT COUNT(*) as c FROM "Result" WHERE "raceId"=$1', [raceId]);
        if (parseInt(chk.rows[0].c) > 0) {
          process.stdout.write(` JA(${chk.rows[0].c}r) skip`);
          totalSkip++; continue;
        }
      } else {
        raceId = 'sc_' + Date.now().toString(36) + ei;
        await db.query(
          'INSERT INTO "Race"(id,name,city,state,date,distances,organizer,status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())',
          [raceId, nomeEvento.slice(0, 200), 'Sergipe', 'SE', date, dist, 'SportsChrono', 'completed']
        );
      }

      const athletes = parseClax(xml);
      process.stdout.write(` ${athletes.length}r`);

      if (!athletes.length) { process.stdout.write(' 0val'); continue; }

      // INSERT atletas
      for (let i = 0; i < athletes.length; i += 100) {
        const chunk = athletes.slice(i, i + 100);
        const vals = chunk.map((a, j) => {
          const id = 'sc_' + (Date.now() + i + j).toString(36) + j;
          const g = a.gender ? `'${a.gender}'` : 'NULL';
          const age = a.birthYear ? new Date().getFullYear() - a.birthYear : 'NULL';
          const bd = a.birthDate ? "'"+ a.birthDate +"'" : 'NULL';
          return `('${id}','${esc(a.name)}',${g},'${a.state}',${age},${bd},1,0,NOW(),NOW())`;
        }).join(',');
        await db.query('INSERT INTO "Athlete"(id,name,gender,state,age,"birthDate","totalRaces","totalPoints","createdAt","updatedAt") VALUES ' + vals + ' ON CONFLICT DO NOTHING');
      }

      // Buscar IDs
      const names = [...new Set(athletes.map(a => a.name))];
      const athleteMap = {};
      for (let i = 0; i < names.length; i += 100) {
        const chunk = names.slice(i, i + 100);
        const ph = chunk.map((_, j) => '$' + (j + 1)).join(',');
        const found = await db.query('SELECT id,name FROM "Athlete" WHERE name IN (' + ph + ')', chunk);
        for (const a of found.rows) athleteMap[a.name] = a.id;
      }

      // INSERT resultados
      let imported = 0;
      for (const r of athletes) {
        const aid = athleteMap[r.name];
        if (!aid) continue;
        const id = 'scr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        try {
          await db.query(
            'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt") VALUES($1,$2,$3,$4,$5,$6,$7,NULL,NULL,0,NOW()) ON CONFLICT DO NOTHING',
            [id, aid, raceId, r.time, calcPace(r.time, distKm), dist, r.ageGroup]
          );
          imported++;
        } catch (_) {}
      }

      totalImported += imported;
      process.stdout.write(` => ${imported} ok`);
      await DELAY(500);

    } catch (e) {
      process.stdout.write(` ERRO:${e.message.slice(0, 40)}`);
    }
  }

  console.log(`\n\nTOTAL: ${totalImported} importados (${totalSkip} pulados)`);
  const r = await db.query('SELECT (SELECT COUNT(*) FROM "Race") c,(SELECT COUNT(*) FROM "Result") res');
  console.log(`Banco: ${r.rows[0].c} corridas | ${r.rows[0].res} resultados`);
  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
