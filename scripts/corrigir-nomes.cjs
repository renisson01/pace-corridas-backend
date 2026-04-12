const { Client } = require('pg');
const DB_URL = process.env.DATABASE_URL;
const DELAY = ms => new Promise(r => setTimeout(r, ms));

async function buscarEvento(numg) {
  const data = `txt=${numg}&cidade=&data=&vData=&nrPagina=1`;
  const res = await fetch('https://centralderesultados.com.br/resultados/buscar-resultado', {
    method:'POST', body:data,
    headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Mozilla/5.0'},
    signal: AbortSignal.timeout(15000)
  });
  const d = await res.json();
  return d.data?.find(e => String(e.numg_evento) === String(numg)) || null;
}

async function main() {
  const db = new Client({connectionString: DB_URL});
  await db.connect();

  const races = await db.query(`SELECT id, name FROM "Race" WHERE name LIKE 'Evento Central %' ORDER BY id`);
  console.log(`${races.rows.length} corridas para corrigir\n`);

  let fixed = 0, skip = 0;
  for (let i = 0; i < races.rows.length; i++) {
    const race = races.rows[i];
    const numg = race.name.replace('Evento Central ', '').trim();
    try {
      const ev = await buscarEvento(numg);
      if (ev) {
        const city = (ev.desc_local||'').split('-')[0].trim();
        const state = (ev.desc_local||'').split('-')[1]?.trim().slice(0,2).toUpperCase()||'';
        await db.query(
          'UPDATE "Race" SET name=$1, city=$2, state=$3, date=$4, "updatedAt"=NOW() WHERE id=$5',
          [ev.nome_evento, city, state, ev.data_evento, race.id]
        );
        fixed++;
        if (i % 20 === 0) console.log(`[${i}/${races.rows.length}] ${numg} → ${ev.nome_evento}`);
      } else {
        skip++;
      }
    } catch(e) {
      skip++;
    }
    await DELAY(150);
  }

  console.log(`\nCorrigidos: ${fixed} | Sem resultado: ${skip}`);
  await db.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
