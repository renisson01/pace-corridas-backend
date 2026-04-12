#!/usr/bin/env node
/**
 * REGENI — Importar eventos do Contime via Central de Resultados
 * Usa lista de numg_evento de /tmp/contime_numgs.txt
 */
const { Client } = require('pg');
const DB_URL = process.env.DATABASE_URL;
const DELAY = ms => new Promise(r => setTimeout(r, ms));
const fs = require('fs');

async function post(path, body) {
  const data = Object.entries(body).map(([k,v]) => k+'='+encodeURIComponent(String(v))).join('&');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40000);
  try {
    const res = await fetch('https://centralderesultados.com.br'+path, {
      method:'POST', body:data, signal:ctrl.signal,
      headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Mozilla/5.0'}
    });
    return await res.json();
  } finally { clearTimeout(timer); }
}

function fmtTime(raw) {
  if (!raw) return null;
  const p = raw.split(':');
  if (p.length !== 3) return null;
  const h=parseInt(p[0]),m=parseInt(p[1]),s=Math.floor(parseFloat(p[2]));
  if (isNaN(h)||isNaN(m)||isNaN(s)||(!h&&!m&&!s)) return null;
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function normDist(d) {
  const n=parseFloat(String(d||5));
  if(n>=40)return'42K';if(n>=20)return'21K';if(n>=14)return'15K';
  if(n>=9)return'10K';if(n>=7)return'8K';if(n>=4)return'5K';return'3K';
}
function calcPace(t,km) {
  if(!t||!km)return null;
  const[h,m,s]=t.split(':').map(Number);
  const sec=h*3600+m*60+s;if(!sec)return null;
  const ps=sec/km;return Math.floor(ps/60)+':'+String(Math.round(ps%60)).padStart(2,'0');
}
function esc(s){return String(s||'').replace(/'/g,"''");}

async function main() {
  const db = new Client({connectionString:DB_URL});
  await db.connect();
  console.log('Conectado!\n');

  // Ler numgs do arquivo
  const numgs = fs.readFileSync('/tmp/contime_numgs.txt','utf8')
    .split('\n').map(s=>s.trim()).filter(Boolean).map(Number).filter(n=>n>0);
  
  console.log(`${numgs.length} eventos para processar\n`);

  let totalImported = 0;
  let totalSkip = 0;

  for (let ei=0; ei<numgs.length; ei++) {
    const numg = numgs[ei];
    process.stdout.write(`\n[${ei+1}/${numgs.length}] numg=${numg}`);

    try {
      // Buscar resultados direto
      const apiRes = await post('/resultados/buscar-resultado-evento', {
        evento: numg, evento_empresa:'', genero:'', distancia:0, categoria:'', nome:'', nrPagina:1
      });

      if (!apiRes.success || !apiRes.data || !apiRes.data.length) {
        process.stdout.write(' sem-dados'); totalSkip++; continue;
      }

      const raw = apiRes.data;
      
      // Detectar nome e data do evento (pegar do primeiro resultado ou buscar)
      // Buscar info do evento pela lista
      const infoRes = await post('/resultados/buscar-resultado', {
        txt:'', cidade:'', data:'', vData:'', nrPagina:1
      });
      
      // Simplificado: usar numg como referência e montar nome genérico
      // Verificar se já existe no banco
      const existing = await db.query(
        'SELECT id, name FROM "Race" WHERE name ILIKE $1 LIMIT 1',
        ['%'+numg+'%']
      );

      // Verificar se já tem resultados para esse numg via raceId
      // Tentativa: buscar pela API de listagem com txt=numg
      const listRes = await post('/resultados/buscar-resultado', {
        txt: String(numg), cidade:'', data:'', vData:'', nrPagina:1
      });
      
      let nome = 'Evento Central '+numg;
      let city = '';
      let state = '';
      let date = new Date().toISOString().slice(0,10);
      
      if (listRes.success && listRes.data && listRes.data.length) {
        const ev = listRes.data.find(e => e.numg_evento === numg) || listRes.data[0];
        if (ev.numg_evento === numg) {
          nome = ev.nome_evento || nome;
          const local = (ev.desc_local||'').split('-').map(s=>s.trim());
          city = local[0]||'';
          state = (local[1]||'').slice(0,2).toUpperCase();
          date = (ev.data_evento||'').slice(0,10) || date;
        }
      }

      // Verificar corrida existente por nome
      const raceChk = await db.query(
        'SELECT id FROM "Race" WHERE name ILIKE $1 AND date::date=$2 LIMIT 1',
        ['%'+nome.slice(0,20).replace(/%/g,'')+'%', date]
      );

      let raceId;
      if (raceChk.rows.length) {
        raceId = raceChk.rows[0].id;
        // Verificar se já tem resultados
        const resChk = await db.query('SELECT COUNT(*) as c FROM "Result" WHERE "raceId"=$1',[raceId]);
        if (parseInt(resChk.rows[0].c) > 0) {
          process.stdout.write(` JA(${resChk.rows[0].c}r) skip`);
          totalSkip++; continue;
        }
        process.stdout.write(' JA(0r)');
      } else {
        const rid = 'ctn_'+Date.now().toString(36)+ei;
        await db.query(
          'INSERT INTO "Race"(id,name,city,state,date,distances,organizer,status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())',
          [rid,nome.slice(0,200),city,state,date,'5K','Central de Resultados','completed']
        );
        raceId = rid;
        process.stdout.write(` NOVA(${nome.slice(0,30)})`);
      }

      process.stdout.write(` ${raw.length}r`);

      // Preparar rows válidas
      const validos = [];
      const distSet = new Set();
      for (const r of raw) {
        const name = (r.ds_nome||'').trim().toUpperCase().replace(/\s+/g,' ');
        if (!name||name.length<2||name.includes('/')) continue;
        const time = fmtTime(r.tempo_liquido||r.tempo_total);
        if (!time) continue;
        const gender = r.ds_genero==='F'?'F':r.ds_genero==='M'?'M':null;
        const dist = normDist(r.distancia);
        const km = parseFloat(r.distancia)||5;
        const birthRaw = r.data_nascimento && r.data_nascimento.slice(0,4) !== '1920' && r.data_nascimento.slice(0,4) !== '0001' ? r.data_nascimento : null;
        const age = birthRaw ? new Date().getFullYear()-new Date(birthRaw).getFullYear() : null;
        distSet.add(dist);
        validos.push({name,gender,time,pace:calcPace(time,km),age,dist,
          ageGroup:r.ds_categoria||null,rank:r.colocacao?parseInt(r.colocacao):null,state});
      }

      if (!validos.length) { process.stdout.write(' 0val'); continue; }

      // Atualizar distances
      await db.query('UPDATE "Race" SET distances=$1 WHERE id=$2',[[...distSet].join(','),raceId]);

      // INSERT atletas
      for (let i=0; i<validos.length; i+=100) {
        const chunk = validos.slice(i,i+100);
        const vals = chunk.map((a,j)=>{
          const id='ctn_'+(Date.now()+i+j).toString(36)+j;
          const g=a.gender?"'"+a.gender+"'":'NULL';
          const ag=a.age?a.age:'NULL';
          return "('"+id+"','"+esc(a.name)+"',"+g+",'"+esc(a.state).slice(0,2)+"',"+ag+",1,0,NOW(),NOW())";
        }).join(',');
        await db.query('INSERT INTO "Athlete"(id,name,gender,state,age,"birthDate","totalRaces","totalPoints","createdAt","updatedAt") VALUES '+vals+' ON CONFLICT DO NOTHING');
      }

      // Buscar IDs atletas
      const names = [...new Set(validos.map(r=>r.name))];
      const athleteMap = {};
      for (let i=0; i<names.length; i+=100) {
        const chunk = names.slice(i,i+100);
        const ph = chunk.map((_,j)=>'$'+(j+1)).join(',');
        const found = await db.query('SELECT id,name FROM "Athlete" WHERE name IN ('+ph+')',chunk);
        for (const a of found.rows) athleteMap[a.name]=a.id;
      }

      // INSERT resultados
      let imported = 0;
      for (const r of validos) {
        const aid = athleteMap[r.name];
        if (!aid) continue;
        const id = 'ctnr_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
        try {
          await db.query(
            'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NULL,0,NOW()) ON CONFLICT DO NOTHING',
            [id,aid,raceId,r.time,r.pace,r.dist,r.ageGroup,r.rank]
          );
          imported++;
        } catch(_) {}
      }

      totalImported += imported;
      process.stdout.write(' => '+imported+' ok');
      await DELAY(200);

    } catch(e) {
      process.stdout.write(' ERRO:'+e.message.slice(0,40));
    }
  }

  console.log(`\n\nTOTAL: ${totalImported} resultados importados (${totalSkip} pulados)`);
  const r = await db.query('SELECT (SELECT COUNT(*) FROM "Race") c,(SELECT COUNT(*) FROM "Athlete") a,(SELECT COUNT(*) FROM "Result") res');
  console.log('Banco: '+r.rows[0].c+' corridas | '+r.rows[0].a+' atletas | '+r.rows[0].res+' resultados');
  await db.end();
  process.exit(0);
}

main().catch(e=>{console.error('FATAL:',e.message);process.exit(1);});
