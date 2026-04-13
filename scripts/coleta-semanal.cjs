#!/usr/bin/env node
/**
 * REGENI — Coleta Semanal (domingo 12h)
 * Importa eventos das últimas 2 semanas de todas as fontes disponíveis.
 *
 * Fontes:
 *   1. Central de Resultados (Nordeste)
 *   2. Runking/Chronomax (nacional, SP/RJ)
 *   3. Yescom (stub — requer credenciais)
 *   4. Gera daily brief atualizado
 *
 * Uso:
 *   node scripts/coleta-semanal.cjs              # últimas 2 semanas
 *   node scripts/coleta-semanal.cjs --semanas 4  # últimas 4 semanas
 *   node scripts/coleta-semanal.cjs --dry-run    # sem importação
 *   node scripts/coleta-semanal.cjs --fonte central  # só Central
 *   node scripts/coleta-semanal.cjs --fonte runking  # só Runking
 *
 * Cron (crontab): 0 12 * * 0 cd ~/pace-corridas-backend && node scripts/coleta-semanal.cjs
 */
const { Client } = require('pg');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const CryptoJS = require('crypto-js');
const https = require('https');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL não definida'); process.exit(1); }

const DELAY = ms => new Promise(r => setTimeout(r, ms));

// ─── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const SEMANAS = parseInt(getArg('--semanas') || '2');
const DRY_RUN = args.includes('--dry-run');
const FONTE = getArg('--fonte'); // null = todas

const CUTOFF = new Date(Date.now() - SEMANAS * 7 * 24 * 3600 * 1000);
const CUTOFF_STR = CUTOFF.toLocaleDateString('pt-BR').padStart(10, '0'); // DD/MM/YYYY

const LOG = [];
function log(msg) { const l = `[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`; console.log(l); LOG.push(l); }

// ─────────────────────────────────────────────────────────────────────────────
//  UTILITÁRIOS COMUNS
// ─────────────────────────────────────────────────────────────────────────────
function normDist(d) {
  const n = parseFloat(String(d || '5').replace(/[^0-9.]/g, ''));
  if (n >= 40) return '42K'; if (n >= 20) return '21K'; if (n >= 14) return '15K';
  if (n >= 12) return '12K'; if (n >= 9) return '10K'; if (n >= 7.5) return '8K';
  if (n >= 6.5) return '7K'; if (n >= 5.5) return '6K'; if (n >= 4) return '5K'; return '3K';
}
function distKm(d) {
  return { '42K': 42, '21K': 21, '15K': 15, '12K': 12, '10K': 10, '8K': 8, '7K': 7, '6K': 6, '5K': 5, '3K': 3 }[d] || 5;
}
function fmtTime(raw) {
  if (!raw) return null;
  const p = String(raw).split(':');
  if (p.length < 3) return null;
  const h = parseInt(p[0]), m = parseInt(p[1]), s = Math.floor(parseFloat(p[2]));
  if (isNaN(h) || isNaN(m) || isNaN(s) || (!h && !m && !s)) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function calcPace(t, km) {
  if (!t || !km) return null;
  const [h, m, s] = t.split(':').map(Number);
  const sec = h * 3600 + m * 60 + s;
  if (!sec) return null;
  const ps = sec / km;
  return Math.floor(ps / 60) + ':' + String(Math.round(ps % 60)).padStart(2, '0');
}
function esc(s) { return String(s || '').replace(/'/g, "''"); }

// ─────────────────────────────────────────────────────────────────────────────
//  FONTE 1: CENTRAL DE RESULTADOS
// ─────────────────────────────────────────────────────────────────────────────
async function postCentral(path, body) {
  const data = Object.entries(body).map(([k, v]) => k + '=' + encodeURIComponent(String(v))).join('&');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40000);
  try {
    const res = await fetch('https://centralderesultados.com.br' + path, {
      method: 'POST', body: data, signal: ctrl.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
    });
    return await res.json();
  } finally { clearTimeout(timer); }
}

async function scraperCentral(db) {
  log('[Central] Iniciando busca eventos últimas ' + SEMANAS + ' semanas...');
  log(`[Central] Filtrando a partir de ${CUTOFF_STR}`);

  const todos = [];
  for (let p = 1; p <= 50; p++) {
    const res = await postCentral('/resultados/buscar-resultado', {
      txt: '', cidade: '', data: CUTOFF_STR, vData: '', nrPagina: p,
    });
    if (!res.success || !res.data || !res.data.length) break;
    todos.push(...res.data);
    const total = res.data[0].qt_total || 0;
    process.stdout.write(`\r  Buscando: ${todos.length}/${total}`);
    if (todos.length >= total) break;
    await DELAY(300);
  }
  console.log('');
  log(`[Central] ${todos.length} eventos encontrados`);

  let imported = 0, skip = 0;

  for (let ei = 0; ei < todos.length; ei++) {
    const ev = todos[ei];
    const numg = ev.numg_evento;
    const nome = (ev.nome_evento || 'Evento ' + numg).slice(0, 200);
    const local = (ev.desc_local || '').split('-').map(s => s.trim());
    const city = local[0] || '';
    const state = (local[1] || '').slice(0, 2).toUpperCase();
    const date = (ev.data_evento || '').slice(0, 10) || '2026-01-01';
    const qtAtletas = ev.qt_atletas || 0;

    if (qtAtletas === 0) { skip++; continue; }

    // Verificar se já existe com resultados
    const ex = await db.query(
      'SELECT id FROM "Race" WHERE "organizer"=\'Central\' AND name ILIKE $1 LIMIT 1',
      ['%' + nome.slice(0, 20) + '%']
    );
    if (ex.rows.length) {
      const chk = await db.query('SELECT COUNT(*) c FROM "Result" WHERE "raceId"=$1', [ex.rows[0].id]);
      if (parseInt(chk.rows[0].c) > 0) { skip++; continue; }
    }

    if (DRY_RUN) {
      log(`  [DRY] ${nome.slice(0, 50)} (${date}) — ${qtAtletas} atletas`);
      continue;
    }

    // Buscar resultados do evento
    try {
      const apiRes = await postCentral('/resultados/buscar-resultado-evento', {
        evento: numg, evento_empresa: '', genero: '', distancia: 0, categoria: '', nome: '', nrPagina: 1,
      });
      if (!apiRes.success || !apiRes.data || !apiRes.data.length) { skip++; continue; }

      const raw = apiRes.data;
      const distSet = new Set();
      const validos = [];
      for (const r of raw) {
        const name = (r.ds_nome || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 200);
        if (!name || name.length < 2 || name.includes('/')) continue;
        const time = fmtTime(r.tempo_liquido || r.tempo_total);
        if (!time) continue;
        const gender = r.ds_genero === 'F' ? 'F' : r.ds_genero === 'M' ? 'M' : null;
        const dist = normDist(r.distancia);
        const km = parseFloat(r.distancia) || 5;
        const age = (r.data_nascimento && !r.data_nascimento.startsWith('1920') && !r.data_nascimento.startsWith('0001'))
          ? new Date().getFullYear() - new Date(r.data_nascimento).getFullYear() : null;
        const birthDate = (r.data_nascimento && !r.data_nascimento.startsWith('1920') && !r.data_nascimento.startsWith('0001'))
          ? r.data_nascimento : null;
        distSet.add(dist);
        validos.push({ name, gender, time, pace: calcPace(time, km), age, birthDate, dist, km,
          ageGroup: r.ds_categoria || null, rank: r.colocacao ? parseInt(r.colocacao) : null, stateAtleta: state });
      }
      if (!validos.length) { skip++; continue; }

      // Criar ou atualizar corrida
      let raceId;
      if (ex.rows.length) {
        raceId = ex.rows[0].id;
        await db.query('UPDATE "Race" SET distances=$1 WHERE id=$2', [[...distSet].join(','), raceId]);
      } else {
        raceId = `cr_${numg}_${Date.now().toString(36)}`;
        await db.query(
          'INSERT INTO "Race"(id,name,city,state,date,distances,organizer,status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())',
          [raceId, nome, city, state, date, [...distSet].join(',') || '5K', 'Central', 'completed']
        );
      }

      // INSERT atletas em lote
      for (let i = 0; i < validos.length; i += 100) {
        const chunk = validos.slice(i, i + 100);
        const vals = chunk.map((a, j) => {
          const id = `cr_${numg}_${i + j}_${Date.now().toString(36)}`;
          const g = a.gender ? `'${a.gender}'` : 'NULL';
          const st = a.stateAtleta ? `'${esc(a.stateAtleta.slice(0, 2))}'` : 'NULL';
          const ag = a.age || 'NULL';
          const bd = a.birthDate ? `'${a.birthDate}'` : 'NULL';
          return `('${id}','${esc(a.name)}',${g},${st},${ag},${bd},1,0,NOW(),NOW())`;
        });
        await db.query('INSERT INTO "Athlete"(id,name,gender,state,age,"birthDate","totalRaces","totalPoints","createdAt","updatedAt") VALUES ' + vals.join(',') + ' ON CONFLICT DO NOTHING');
      }

      // Buscar IDs
      const names = [...new Set(validos.map(r => r.name))];
      const athleteMap = {};
      for (let i = 0; i < names.length; i += 100) {
        const chunk = names.slice(i, i + 100);
        const ph = chunk.map((_, j) => `$${j + 1}`).join(',');
        const rows = await db.query(`SELECT id,name FROM "Athlete" WHERE name IN (${ph})`, chunk);
        for (const r of rows.rows) athleteMap[r.name] = r.id;
      }

      // INSERT resultados
      let totalMod = 0;
      for (const r of validos) {
        const aid = athleteMap[r.name];
        if (!aid) continue;
        const id = `crr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
        try {
          await db.query(
            'INSERT INTO "Result"(id,"athleteId","raceId",time,pace,distance,"ageGroup","overallRank","genderRank",points,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,NULL,0,NOW(),NOW()) ON CONFLICT DO NOTHING',
            [id, aid, raceId, r.time, r.pace, r.dist, r.ageGroup, r.rank]
          );
          totalMod++;
        } catch (_) {}
      }

      imported += totalMod;
      if (totalMod > 0) log(`  ✓ ${nome.slice(0, 50)} → ${totalMod} resultados`);
      await DELAY(300);
    } catch (e) {
      log(`  ✗ ${nome.slice(0, 40)}: ${e.message.slice(0, 40)}`);
      skip++;
    }
  }

  log(`[Central] Concluído: ${imported} importados, ${skip} pulados`);
  return imported;
}

// ─────────────────────────────────────────────────────────────────────────────
//  FONTE 2: RUNKING (via scraper-runking.cjs)
// ─────────────────────────────────────────────────────────────────────────────
async function scraperRunking() {
  log('[Runking] Iniciando scraper...');
  if (DRY_RUN) {
    log('[Runking] Dry-run: invocando com --dry-run');
  }

  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'scraper-runking.cjs');
    const scriptArgs = [`--semanas`, String(SEMANAS)];
    if (DRY_RUN) scriptArgs.push('--dry-run');

    const child = spawn('node', [scriptPath, ...scriptArgs], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    child.stdout.on('data', d => { const s = d.toString(); process.stdout.write(s); out += s; });
    child.stderr.on('data', d => process.stderr.write(d.toString()));
    child.on('close', code => {
      const m = out.match(/(\d+) resultados importados/);
      const imported = m ? parseInt(m[1]) : 0;
      log(`[Runking] Concluído (exit ${code}): ${imported} importados`);
      resolve(imported);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  FONTE 3: YESCOM (stub)
// ─────────────────────────────────────────────────────────────────────────────
async function scraperYescom() {
  log('[Yescom] Verificando eventos públicos...');
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'scraper-yescom.cjs');
    const child = spawn('node', [scriptPath], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', d => process.stdout.write(d.toString()));
    child.stderr.on('data', d => process.stderr.write(d.toString()));
    child.on('close', () => { log('[Yescom] Concluído'); resolve(0); });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  GERAR DAILY BRIEF
// ─────────────────────────────────────────────────────────────────────────────
async function gerarDailyBrief() {
  const scriptPath = path.join(__dirname, 'daily-brief.cjs');
  if (!fs.existsSync(scriptPath)) { log('[Brief] Script não encontrado'); return; }
  log('[Brief] Gerando daily brief atualizado...');
  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', d => process.stdout.write(d.toString()));
    child.stderr.on('data', d => process.stderr.write(d.toString()));
    child.on('close', () => { log('[Brief] Daily brief gerado'); resolve(); });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();
  const hoje = new Date().toISOString().slice(0, 10);

  console.log('\n' + '='.repeat(60));
  log(`REGENI Coleta Semanal — ${hoje}`);
  log(`Janela: últimas ${SEMANAS} semanas (>= ${CUTOFF_STR})`);
  if (DRY_RUN) log('MODO DRY-RUN (sem importação)');
  console.log('='.repeat(60));

  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  log('Banco conectado');

  const totais = { central: 0, runking: 0, yescom: 0 };

  // Executar fontes (em série para respeitar rate limit)
  const fontes = FONTE ? [FONTE] : ['central', 'runking', 'yescom'];

  if (fontes.includes('central')) {
    try { totais.central = await scraperCentral(db); }
    catch (e) { log(`[Central] ERRO: ${e.message}`); }
    await DELAY(2000);
  }

  // Fechar conexão antes dos scrapers externos (cada um abre a própria)
  try { await db.end(); } catch (_) {}

  if (fontes.includes('runking')) {
    try { totais.runking = await scraperRunking(); }
    catch (e) { log(`[Runking] ERRO: ${e.message}`); }
    await DELAY(2000);
  }

  if (fontes.includes('yescom')) {
    try { totais.yescom = await scraperYescom(); }
    catch (e) { log(`[Yescom] ERRO: ${e.message}`); }
  }

  // Gerar brief
  try { await gerarDailyBrief(); }
  catch (e) { log(`[Brief] ERRO: ${e.message}`); }

  // Resumo final
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const totalGeral = totais.central + totais.runking + totais.yescom;

  console.log('\n' + '='.repeat(60));
  log('COLETA SEMANAL CONCLUÍDA');
  log(`  Central de Resultados: ${totais.central} resultados`);
  log(`  Runking/Chronomax:     ${totais.runking} resultados`);
  log(`  Yescom:                ${totais.yescom} resultados`);
  log(`  TOTAL:                 ${totalGeral} resultados`);
  log(`  Tempo total:           ${elapsed}s`);
  console.log('='.repeat(60));

  // Salvar log da coleta no vault
  const vaultDir = path.join(__dirname, '../cerebro/daily');
  if (fs.existsSync(vaultDir)) {
    const logFile = path.join(vaultDir, `coleta-${hoje}.md`);
    const md = `---
date: ${hoje}
type: coleta-semanal
tags: [coleta, regeni, automacao]
---

# Coleta Semanal ${hoje}

## Resultados

| Fonte | Importados |
|-------|-----------|
| Central de Resultados | ${totais.central} |
| Runking/Chronomax | ${totais.runking} |
| Yescom | ${totais.yescom} |
| **TOTAL** | **${totalGeral}** |

## Log

\`\`\`
${LOG.join('\n')}
\`\`\`

---
_Gerado automaticamente em ${elapsed}s_
`;
    fs.writeFileSync(logFile, md, 'utf8');
    log(`Log salvo em: ${logFile}`);
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
