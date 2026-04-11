const https = require('https');
const fs = require('fs');
const DELAY = ms => new Promise(r => setTimeout(r, ms));

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = Object.entries(body).map(([k,v]) => k+'='+encodeURIComponent(v)).join('&');
    const req = https.request({
      hostname: 'centralderesultados.com.br', path, method: 'POST',
      headers: {'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(data),'User-Agent':'Mozilla/5.0'}
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(d)); });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

async function main() {
  console.log('🚀 REGENI — Central de Resultados Scraper Histórico 2014-2026\n');
  const anos = ['2023','2022','2021','2020','2019','2018','2017','2016','2015','2014'];
  let todos = [];
  let chunkNum = 0;
  let chunk = [];
  let total = 0;

  for (const ano of anos) {
    console.log(`\n📅 Ano ${ano}...`);
    for (let p = 1; p <= 200; p++) {
      try {
        const raw = await post('/resultados/buscar-resultado', {txt:'',cidade:'',data:ano,vData:'',nrPagina:p});
        let json;
        try { json = JSON.parse(raw); } catch(e) { break; }
        if (!json.success || !json.data?.length) break;
        
        const novos = json.data.filter(e => !todos.find(t => t.numg_evento === e.numg_evento));
        todos.push(...novos);
        process.stdout.write(`\r  Pág ${p}: +${novos.length} novos (total eventos: ${todos.length})`);
        if (json.data.length < 10) break;
        await DELAY(200);
      } catch(e) {
        console.log(`\n  ⚠️ Erro página ${p}: ${e.message}`);
        await DELAY(2000);
      }
    }

    const eventosAno = todos.filter(e => (e.data_evento||'').startsWith(ano));
    console.log(`\n  Scrapeando ${eventosAno.length} eventos de ${ano}...`);

    for (let i = 0; i < eventosAno.length; i++) {
      const ev = eventosAno[i];
      process.stdout.write(`\r  [${i+1}/${eventosAno.length}] ${(ev.nome_evento||'').substring(0,35).padEnd(35)} `);
      try {
        const raw = await post('/resultados/buscar-resultado-evento', {evento:ev.numg_evento,evento_empresa:'',genero:'',distancia:0,categoria:'',nome:'',nrPagina:1});
        const j = JSON.parse(raw);
        if (!j.success || !j.data?.length) continue;

        const dists = [...new Set(j.data.map(r=>r.distancia||'').filter(Boolean))];
        if (!dists.length) dists.push('');

        for (const dist of dists) {
          for (let p = 1; p <= 50; p++) {
            const r2 = await post('/resultados/buscar-resultado-evento',{evento:ev.numg_evento,evento_empresa:'',genero:'',distancia:dist||0,categoria:'',nome:'',nrPagina:p});
            let j2; try { j2=JSON.parse(r2); } catch(e){break;}
            if (!j2.success||!j2.data?.length) break;
            j2.data.forEach(r => {
              const nome = r.ds_nome||r.nome_atleta||'';
              const tempo = r.tempo_oficial||r.tempo_total||'';
              if (!nome||!tempo) return;
              chunk.push({
                eventoId:ev.numg_evento,eventoNome:ev.nome_evento,
                eventoData:ev.data_evento,eventoLocal:ev.desc_local,
                slug:ev.ds_slug,pos:r.colocacao||0,
                nome:nome.toUpperCase(),genero:r.ds_genero||'M',
                idade:r.nr_idade||'',cidade:r.nome_cidade||'',
                estado:r.ds_estado||'',tempo:tempo.substring(0,8),
                pace:r.pace||'',faixa:r.ds_categoria||'',
                distancia:r.distancia||dist||''
              });
              total++;
            });
            if (j2.data.length < 100) break;
            await DELAY(100);
          }
        }
        process.stdout.write(`✅ total:${total}`);
      } catch(e) { process.stdout.write(`❌`); }

      if (chunk.length >= 50000) {
        chunkNum++;
        const f = `/tmp/hist_chunk_${String(chunkNum).padStart(3,'0')}.json`;
        fs.writeFileSync(f, JSON.stringify(chunk));
        console.log(`\n  💾 Salvo: ${f} (${chunk.length} registros)`);
        chunk = [];
      }
      await DELAY(150);
    }
  }

  if (chunk.length) {
    chunkNum++;
    const f = `/tmp/hist_chunk_${String(chunkNum).padStart(3,'0')}.json`;
    fs.writeFileSync(f, JSON.stringify(chunk));
    console.log(`\n💾 Último chunk: ${f}`);
  }

  console.log(`\n🎉 Total histórico: ${total} atletas em ${chunkNum} chunks`);
}

main().catch(console.error);
