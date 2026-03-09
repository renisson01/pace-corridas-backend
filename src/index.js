<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>PACE Brasil — Corrida de Rua</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,400;0,700;0,900;1,900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--verde:#00E676;--verde2:#00C853;--laranja:#FF6D00;--bg:#080B10;--bg2:#0D1117;--bg3:#161B27;--surface:#1C2333;--border:#1F2937;--text:#F1F5F9;--muted:#64748B}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{overflow-x:hidden}
body{background:var(--bg);color:var(--text);font-family:'Barlow',sans-serif;min-height:100vh;padding-bottom:80px}
a{text-decoration:none;color:inherit}

/* TOPBAR */
.topbar{position:fixed;top:0;left:0;right:0;z-index:100;height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;transition:background .3s}
.topbar.scrolled{background:rgba(8,11,16,.97);backdrop-filter:blur(12px);border-bottom:1px solid var(--border)}
.logo{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:26px;color:var(--verde);letter-spacing:2px}
.btn-entrar{background:transparent;border:1px solid var(--border);color:var(--text);padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600}
.btn-perfil{background:var(--verde);color:#080B10;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:700;display:none}

/* HERO */
.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:80px 20px 40px;position:relative;overflow:hidden}
.hero-bg{position:absolute;inset:0;background:radial-gradient(ellipse 100% 80% at 50% -10%,rgba(0,230,118,.12),transparent 60%),radial-gradient(ellipse 60% 50% at 80% 80%,rgba(255,109,0,.06),transparent 50%)}
.hero-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(31,41,55,.3) 1px,transparent 1px),linear-gradient(90deg,rgba(31,41,55,.3) 1px,transparent 1px);background-size:40px 40px;mask-image:radial-gradient(ellipse at 50% 50%,black 30%,transparent 80%)}
.hero-eyebrow{display:inline-flex;align-items:center;gap:8px;background:rgba(0,230,118,.08);border:1px solid rgba(0,230,118,.2);border-radius:20px;padding:5px 16px;font-size:11px;font-weight:700;color:var(--verde);letter-spacing:2px;text-transform:uppercase;margin-bottom:20px;position:relative}
.hero-eyebrow::before{content:'';width:6px;height:6px;background:var(--verde);border-radius:50%;animation:blink 2s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
.hero-title{font-family:'Barlow Condensed',sans-serif;font-size:clamp(52px,12vw,96px);font-weight:900;line-height:.95;letter-spacing:-2px;margin-bottom:16px;position:relative}
.l1{display:block;color:var(--text)}
.l2{display:block;color:var(--verde);font-style:italic}
.l3{display:block;color:var(--text);opacity:.25;font-size:.55em;letter-spacing:6px;font-style:normal;margin-top:10px}
.hero-sub{color:var(--muted);font-size:16px;line-height:1.6;max-width:480px;margin:0 auto 32px;position:relative}
.hero-ctas{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;position:relative;margin-bottom:48px}
.cta-p{background:var(--verde);color:#080B10;padding:14px 32px;border-radius:30px;font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:900;letter-spacing:1px;transition:all .2s}
.cta-p:hover{background:var(--verde2);transform:scale(1.05)}
.cta-s{background:transparent;color:var(--text);padding:14px 28px;border-radius:30px;font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:700;border:1px solid var(--border);transition:all .2s}

/* STATS */
.stats-bar{display:flex;background:var(--bg2);border:1px solid var(--border);border-radius:16px;overflow:hidden;max-width:560px;margin:0 auto;position:relative}
.stat{flex:1;padding:16px 10px;text-align:center;border-right:1px solid var(--border)}
.stat:last-child{border-right:none}
.stat-n{font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:900;color:var(--verde);display:block}
.stat-l{font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px}

/* SEÇÕES */
.section{padding:24px 16px;max-width:700px;margin:0 auto}
.sec-header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:16px}
.sec-label{font-size:10px;font-weight:700;color:var(--verde);text-transform:uppercase;letter-spacing:2px;margin-bottom:4px}
.sec-title{font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:900}
.ver-todos{font-size:13px;color:var(--muted)}
.ver-todos:hover{color:var(--verde)}

/* X1 BANNER — DESTAQUE */
.x1-banner{display:block;margin:0 16px 24px;background:linear-gradient(135deg,#0f0a00,#1a0a00);border:1px solid rgba(255,109,0,.4);border-radius:20px;padding:20px;transition:all .2s;position:relative;overflow:hidden}
.x1-banner::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(255,109,0,.08),transparent)}
.x1-banner:hover{border-color:var(--laranja);transform:translateY(-2px);box-shadow:0 8px 30px rgba(255,109,0,.15)}
.x1-live{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;color:var(--laranja);text-transform:uppercase;letter-spacing:2px;margin-bottom:8px}
.x1-live::before{content:'';width:6px;height:6px;background:#ef4444;border-radius:50%;animation:blink 1.5s infinite}
.x1-titulo{font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:900;margin-bottom:4px}
.x1-sub{font-size:13px;color:var(--muted);margin-bottom:14px}
.x1-atletas{display:flex;align-items:center;gap:12px}
.x1-atleta{flex:1;background:rgba(255,255,255,.04);border-radius:12px;padding:10px;text-align:center}
.x1-atleta-nome{font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:900}
.x1-atleta-pct{font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:900}
.x1-vs{font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:900;color:var(--muted);flex-shrink:0}
.x1-barra-wrap{margin-top:10px;height:4px;background:var(--border);border-radius:2px;overflow:hidden}
.x1-barra-inner{height:100%;background:linear-gradient(90deg,#ff4500,#ff8c00);border-radius:2px;transition:width .8s}

/* QUICK GRID */
.quick-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.qcard{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:16px 10px;text-align:center;transition:all .2s;display:flex;flex-direction:column;align-items:center;gap:6px}
.qcard:hover{border-color:var(--verde);background:var(--bg3)}
.qcard.destaque{border-color:rgba(255,109,0,.3);background:linear-gradient(135deg,var(--bg2),rgba(255,109,0,.04))}
.qcard.destaque:hover{border-color:var(--laranja)}
.qi{font-size:28px;line-height:1}
.ql{font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:700}
.qd{font-size:10px;color:var(--muted)}

/* CORRIDAS */
.ccard{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;transition:border-color .2s}
.ccard:hover{border-color:var(--verde)}
.cdata{background:var(--bg3);border-radius:8px;padding:6px 10px;text-align:center;min-width:44px;flex-shrink:0}
.cdia{font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:900;color:var(--verde);line-height:1}
.cmes{font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase}
.cnome{font-size:14px;font-weight:700}
.cmeta{font-size:11px;color:var(--muted);margin-top:3px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.cdist{background:rgba(0,230,118,.08);color:var(--verde);border:1px solid rgba(0,230,118,.15);border-radius:6px;padding:1px 6px;font-size:10px;font-weight:700}

/* RANKING */
.ritem{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:10px}
.rpos{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:900;min-width:32px;text-align:center}
.rfoto{width:34px;height:34px;border-radius:50%;background:var(--bg3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;overflow:hidden}
.rfoto img{width:100%;height:100%;object-fit:cover}
.rnome{font-size:13px;font-weight:700}
.rmeta{font-size:11px;color:var(--muted);margin-top:2px}
.rpts{font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700;color:var(--verde);margin-left:auto;flex-shrink:0}

/* SKELETON */
.skeleton{animation:shimmer 1.5s infinite}
@keyframes shimmer{0%,100%{opacity:.6}50%{opacity:1}}
.skel{background:var(--bg3);border-radius:6px}

/* BOTTOM NAV */
.bottom-nav{position:fixed;bottom:0;left:0;right:0;z-index:100;background:rgba(13,17,23,.97);backdrop-filter:blur(12px);border-top:1px solid var(--border);display:flex;padding:6px 0 calc(10px + env(safe-area-inset-bottom))}
.nav-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 0;color:var(--muted);transition:color .2s}
.nav-item.ativo{color:var(--verde)}
.nav-icon{font-size:20px;line-height:1}
.nav-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
</style>
</head>
<body>

<div class="topbar" id="topbar">
  <a href="/" class="logo">PACE</a>
  <div style="display:flex;align-items:center;gap:8px">
    <a href="/entrar.html" class="btn-entrar" id="btnEntrar">Entrar</a>
    <a href="/perfil.html" class="btn-perfil" id="btnPerfil">Meu Perfil</a>
  </div>
</div>

<!-- HERO -->
<div class="hero">
  <div class="hero-bg"></div>
  <div class="hero-grid"></div>
  <div class="hero-eyebrow">🏃 Plataforma de Corrida de Rua</div>
  <h1 class="hero-title">
    <span class="l1">CORRA</span>
    <span class="l2">MAIS LONGE</span>
    <span class="l3">PACE BRASIL</span>
  </h1>
  <p class="hero-sub">Treinos personalizados, corridas, ranking e comunidade. Tudo para o corredor brasileiro.</p>
  <div class="hero-ctas">
    <a href="/entrar.html" class="cta-p" id="ctaPrincipal">Começar Agora →</a>
    <a href="/corridas-abertas.html" class="cta-s">Ver Corridas</a>
  </div>
  <div class="stats-bar">
    <div class="stat"><span class="stat-n" id="sA">—</span><span class="stat-l">Atletas</span></div>
    <div class="stat"><span class="stat-n" id="sC">—</span><span class="stat-l">Corridas</span></div>
    <div class="stat"><span class="stat-n" id="sR">—</span><span class="stat-l">Resultados</span></div>
    <div class="stat"><span class="stat-n" id="sCo">—</span><span class="stat-l">Grupos</span></div>
  </div>
</div>

<!-- X1 DAS RUAS — DESTAQUE -->
<a href="/x1.html" class="x1-banner" id="x1Banner">
  <div class="x1-live">X1 das Ruas</div>
  <div class="x1-titulo">🥊 DUELO AO VIVO</div>
  <div class="x1-sub">Dois atletas, uma corrida. Vote e apoie seu favorito!</div>
  <div class="x1-atletas">
    <div class="x1-atleta">
      <div class="x1-atleta-nome" id="x1NomeA">—</div>
      <div class="x1-atleta-pct" style="color:#FF6D00" id="x1PctA">50%</div>
      <div style="font-size:10px;color:var(--muted)" id="x1DistA">—</div>
    </div>
    <div class="x1-vs">VS</div>
    <div class="x1-atleta">
      <div class="x1-atleta-nome" id="x1NomeB">—</div>
      <div class="x1-atleta-pct" style="color:var(--verde)" id="x1PctB">50%</div>
      <div style="font-size:10px;color:var(--muted)" id="x1DistB">—</div>
    </div>
  </div>
  <div class="x1-barra-wrap"><div class="x1-barra-inner" id="x1Barra" style="width:50%"></div></div>
</a>

<!-- ACESSO RÁPIDO -->
<div class="section" style="padding-top:0">
  <div class="sec-header">
    <div><div class="sec-label">Explorar</div><div class="sec-title">Acesso Rápido</div></div>
  </div>
  <div class="quick-grid">
    <a href="/treinador.html" class="qcard destaque">
      <span class="qi">📋</span>
      <span class="ql">Treinador</span>
      <span class="qd">Pace personalizado</span>
    </a>
    <a href="/corridas-abertas.html" class="qcard">
      <span class="qi">🏁</span>
      <span class="ql">Corridas</span>
      <span class="qd">Próximas provas</span>
    </a>
    <a href="/elite.html" class="qcard">
      <span class="qi">🏆</span>
      <span class="ql">Ranking</span>
      <span class="qd">Top Brasil</span>
    </a>
    <a href="/comunidades.html" class="qcard">
      <span class="qi">👥</span>
      <span class="ql">Grupos</span>
      <span class="qd">Sua turma</span>
    </a>
    <a href="/resultados.html" class="qcard">
      <span class="qi">🔍</span>
      <span class="ql">Resultados</span>
      <span class="qd">Buscar tempo</span>
    </a>
    <a href="/calculadoras.html" class="qcard">
      <span class="qi">⚡</span>
      <span class="ql">Calculadoras</span>
      <span class="qd">Pace e ritmo</span>
    </a>
    <a href="/atleta.html" class="qcard" id="cardAtleta" style="display:none">
      <span class="qi">🏃</span>
      <span class="ql">Meu Treino</span>
      <span class="qd">Treino de hoje</span>
    </a>
  </div>
</div>

<!-- PRÓXIMAS CORRIDAS -->
<div class="section" style="padding-top:0">
  <div class="sec-header">
    <div><div class="sec-label">Agenda</div><div class="sec-title">Próximas Corridas</div></div>
    <a href="/corridas-abertas.html" class="ver-todos">Ver todas →</a>
  </div>
  <div id="corridasLista">
    <div class="ccard skeleton"><div class="skel" style="width:44px;height:52px;border-radius:8px;flex-shrink:0"></div><div style="flex:1"><div class="skel" style="height:14px;width:60%;margin-bottom:8px"></div><div class="skel" style="height:11px;width:40%"></div></div></div>
    <div class="ccard skeleton"><div class="skel" style="width:44px;height:52px;border-radius:8px;flex-shrink:0"></div><div style="flex:1"><div class="skel" style="height:14px;width:70%;margin-bottom:8px"></div><div class="skel" style="height:11px;width:45%"></div></div></div>
  </div>
</div>

<!-- RANKING -->
<div class="section" style="padding-top:0">
  <div class="sec-header">
    <div><div class="sec-label">Top Brasil</div><div class="sec-title">Ranking Geral</div></div>
    <a href="/elite.html" class="ver-todos">Ver completo →</a>
  </div>
  <div id="rankingLista">
    <div class="ritem skeleton"><div class="skel" style="width:32px;height:18px;border-radius:4px"></div><div class="rfoto"></div><div style="flex:1"><div class="skel" style="height:13px;width:50%;margin-bottom:6px"></div><div class="skel" style="height:11px;width:35%"></div></div></div>
    <div class="ritem skeleton"><div class="skel" style="width:32px;height:18px;border-radius:4px"></div><div class="rfoto"></div><div style="flex:1"><div class="skel" style="height:13px;width:60%;margin-bottom:6px"></div><div class="skel" style="height:11px;width:40%"></div></div></div>
  </div>
</div>

<nav class="bottom-nav">
  <a href="/" class="nav-item ativo"><span class="nav-icon">🏠</span><span class="nav-label">Início</span></a>
  <a href="/corridas-abertas.html" class="nav-item"><span class="nav-icon">🏁</span><span class="nav-label">Corridas</span></a>
  <a href="/treinador.html" class="nav-item"><span class="nav-icon">📋</span><span class="nav-label">Treinador</span></a>
  <a href="/elite.html" class="nav-item"><span class="nav-icon">🏆</span><span class="nav-label">Ranking</span></a>
  <a href="/comunidades.html" class="nav-item"><span class="nav-icon">👥</span><span class="nav-label">Grupos</span></a>
</nav>

<script>
// TOKEN correto
const token = localStorage.getItem('pace_token');
const user = JSON.parse(localStorage.getItem('pace_user') || '{}');

window.addEventListener('scroll', () => document.getElementById('topbar').classList.toggle('scrolled', scrollY > 20));

// Mostrar botão correto
if (token && user.name) {
  document.getElementById('btnEntrar').style.display = 'none';
  document.getElementById('btnPerfil').style.display = 'flex';
  // Mostrar card "Meu Treino" para atletas logados
  const cardAtleta = document.getElementById('cardAtleta');
  if (cardAtleta) cardAtleta.style.display = 'flex';
  // CTA principal baseado no tipo de usuário
  if (user.role === 'COACH') {
    document.getElementById('ctaPrincipal').href = '/treinador.html';
    document.getElementById('ctaPrincipal').textContent = 'Meu Treinador →';
  } else {
    document.getElementById('ctaPrincipal').href = '/atleta.html';
    document.getElementById('ctaPrincipal').textContent = 'Meu Treino Hoje →';
  }
}

// STATS
async function carregarStats() {
  try {
    const d = await fetch('/ranking/stats').then(r => r.json());
    animN('sA', d.totalAtletas || d.athletes || 0);
    animN('sC', d.totalCorridas || d.races || 0);
    animN('sR', d.totalResultados || d.results || 0);
    animN('sCo', d.totalComunidades || d.communities || 0);
  } catch(e) {
    ['sA','sC','sR','sCo'].forEach(id => document.getElementById(id).textContent = '—');
  }
}

function animN(id, t) {
  const el = document.getElementById(id);
  if (!el) return;
  let s = 0; const steps = 40;
  const iv = setInterval(() => {
    s++; const v = Math.floor(t * s / steps);
    el.textContent = v >= 1000 ? (v/1000).toFixed(1)+'k' : v;
    if (s >= steps) { el.textContent = t >= 1000 ? (t/1000).toFixed(1)+'k' : t; clearInterval(iv); }
  }, 1500/40);
}

// X1 — carregar votos reais do banco
async function carregarX1() {
  try {
    const d = await fetch('/pagamentos/x1/votos').then(r => r.json());
    const votos = d.votos || {};
    const nomeA = d.atletaA || 'Atleta A';
    const nomeB = d.atletaB || 'Atleta B';
    const distA = d.distanciaA || '';
    const distB = d.distanciaB || '';
    const totalA = votos[Object.keys(votos)[0]] || 0;
    const totalB = votos[Object.keys(votos)[1]] || 0;
    const total = totalA + totalB;
    const pctA = total ? Math.round(totalA/total*100) : 50;
    const pctB = 100 - pctA;

    document.getElementById('x1NomeA').textContent = nomeA;
    document.getElementById('x1NomeB').textContent = nomeB;
    document.getElementById('x1PctA').textContent = pctA + '%';
    document.getElementById('x1PctB').textContent = pctB + '%';
    document.getElementById('x1DistA').textContent = distA;
    document.getElementById('x1DistB').textContent = distB;
    document.getElementById('x1Barra').style.width = pctA + '%';
  } catch(e) {
    // Fallback com nomes padrão se não houver duelo ativo
    document.getElementById('x1NomeA').textContent = 'Tiago';
    document.getElementById('x1NomeB').textContent = 'Pedro';
  }
}

// CORRIDAS
async function carregarCorridas() {
  try {
    const d = await fetch('/corridas-abertas?limit=5').then(r => r.json());
    const lista = Array.isArray(d) ? d : d.corridas || [];
    if (!lista.length) {
      document.getElementById('corridasLista').innerHTML = '<p style="color:var(--muted);font-size:13px;padding:16px">Nenhuma corrida cadastrada ainda.</p>';
      return;
    }
    document.getElementById('corridasLista').innerHTML = lista.slice(0,5).map(c => {
      const dt = new Date(c.data || c.date);
      const dists = (c.distancias || c.distances || '').split(',').map(x => x.trim()).filter(Boolean);
      return `<a href="/corridas-abertas.html" class="ccard">
        <div class="cdata"><div class="cdia">${dt.getDate()}</div><div class="cmes">${dt.toLocaleDateString('pt-BR',{month:'short'}).replace('.','').toUpperCase()}</div></div>
        <div style="flex:1;min-width:0">
          <div class="cnome">${c.nome||c.name}</div>
          <div class="cmeta"><span>📍 ${c.cidade||c.city}${(c.estado||c.state)?', '+(c.estado||c.state):''}</span>${dists.map(d=>`<span class="cdist">${d}</span>`).join('')}</div>
        </div>
      </a>`;
    }).join('');
  } catch(e) {
    document.getElementById('corridasLista').innerHTML = '<p style="color:var(--muted);font-size:13px;padding:16px">Erro ao carregar corridas.</p>';
  }
}

// RANKING
async function carregarRanking() {
  try {
    const d = await fetch('/ranking?limit=5').then(r => r.json());
    const lista = Array.isArray(d) ? d : d.atletas || d.ranking || [];
    if (!lista.length) {
      document.getElementById('rankingLista').innerHTML = '<p style="color:var(--muted);font-size:13px;padding:16px">Ranking em breve.</p>';
      return;
    }
    const m = ['🥇','🥈','🥉'];
    document.getElementById('rankingLista').innerHTML = lista.slice(0,5).map((a,i) =>
      `<a href="/elite.html" class="ritem">
        <span class="rpos" style="color:${i===0?'#FFD700':i===1?'#C0C0C0':i===2?'#CD7F32':'var(--muted)'}">${m[i]||'#'+(i+1)}</span>
        <div class="rfoto">${(a.foto||a.photo)?`<img src="${a.foto||a.photo}" onerror="this.style.display='none'">`:'🏃'}</div>
        <div style="flex:1;min-width:0">
          <div class="rnome">${a.nome||a.name}</div>
          <div class="rmeta">${a.estado||a.state||''} · ${a.totalProvas||a.totalRaces||0} provas</div>
        </div>
        <span class="rpts">${a.pontos||a.totalPoints||0} pts</span>
      </a>`
    ).join('');
  } catch(e) {
    document.getElementById('rankingLista').innerHTML = '<p style="color:var(--muted);font-size:13px;padding:16px">Erro ao carregar ranking.</p>';
  }
}

carregarStats();
carregarX1();
carregarCorridas();
carregarRanking();
</script>
</body>
</html>
