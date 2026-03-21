const fs = require('fs');

function readFile(p) { return fs.readFileSync('public/' + p, 'utf-8'); }
function writeFile(p, c) { fs.writeFileSync('public/' + p, c); console.log('  ✅ ' + p); }

console.log('🔧 FASE 1: Corrigindo problemas graves...\n');

// ═══════════════════════════════════════
// FIX 1: ia.html — remover bnav original (linhas 161-167) + fix token + remover duplicata
// ═══════════════════════════════════════
console.log('1. ia.html — nav duplicada + token + duplicata');

let ia = readFile('ia.html');

// Remover nav original (.bnav)
ia = ia.replace(/<nav class="bnav">[\s\S]*?<\/nav>/, '');
// Remover CSS do bnav
ia = ia.replace(/\.bnav\{[\s\S]*?flex-shrink:0\}/, '');
// Remover estilos .ni que conflitam
ia = ia.replace(/\.ni\{flex:1;display:flex;[\s\S]*?\.ni\.on,.ni:hover\{color:var\(--verde\)\}/, '');

// Fix token: 'token' → 'pace_token'
ia = ia.replace("let token=localStorage.getItem('token');", "let token=localStorage.getItem('pace_token');");

// Remover função carregarHistorico duplicada (a que usa TOKEN maiúsculo)
ia = ia.replace(/\/\/ === CARREGAR HISTORICO AO ABRIR ===[\s\S]*?if \(TOKEN\) \{ setTimeout\(carregarHistorico, 500\); \}/, '// Historico carregado via loadHist()');

writeFile('ia.html', ia);

// ═══════════════════════════════════════
// FIX 2: perfil.html — remover nav original (linhas 128-137)
// ═══════════════════════════════════════
console.log('2. perfil.html — nav duplicada');

let perfil = readFile('perfil.html');

// Remover nav original tailwind
perfil = perfil.replace(/<nav class="fixed bottom-0[\s\S]*?<\/nav>/, '');

writeFile('perfil.html', perfil);

// ═══════════════════════════════════════
// FIX 3: corridas-abertas.html — remover bottomnav original (linhas 316-331)
// ═══════════════════════════════════════
console.log('3. corridas-abertas.html — nav duplicada');

let corridas = readFile('corridas-abertas.html');

// Remover nav original
corridas = corridas.replace(/<nav class="bottomnav">[\s\S]*?<\/nav>/, '');
// Remover CSS do bottomnav e bnav-btn
corridas = corridas.replace(/\.bottomnav\{[\s\S]*?\.bnav-btn\.on \.ico\{[^}]+\}/, '');

writeFile('corridas-abertas.html', corridas);

// ═══════════════════════════════════════
// FIX 4: exames.html — remover nav original (linha 129)
// ═══════════════════════════════════════
console.log('4. exames.html — nav duplicada');

let exames = readFile('exames.html');

// Remover nav original
exames = exames.replace(/<div class="nav">[\s\S]*?<\/div>\s*\n/, '');
// Remover CSS do .nav original
exames = exames.replace(/\.nav \{[^}]+\}\n\.nav a \{[^}]+\}\n\.nav a\.active \{[^}]+\}\n\.nav a \.ni \{[^}]+\}/, '');

writeFile('exames.html', exames);

// ═══════════════════════════════════════
// FIX 5: cobaia.html — remover nav original (linha 536)
// ═══════════════════════════════════════
console.log('5. cobaia.html — nav duplicada');

let cobaia = readFile('cobaia.html');

// Remover nav original
cobaia = cobaia.replace(/<div class="nav">[\s\S]*?<\/div>\s*\n(?=\s*<!-- (?:MODAIS|PACE))/, '');
// Remover CSS do .nav 
cobaia = cobaia.replace(/\.nav \{ position:fixed[^}]+\}\n\.nav a \{[^}]+\}\n\.nav a\.active \{[^}]+\}\n\.nav a \.ni \{[^}]+\}/, '');

writeFile('cobaia.html', cobaia);

// ═══════════════════════════════════════
// FIX 6: atleta.html — MANTER nav original (controla showPage) + REMOVER pace-nav
// A bottom-nav do atleta é funcional (troca páginas internas), não pode remover
// ═══════════════════════════════════════
console.log('6. atleta.html — remover pace-nav (manter original funcional)');

let atleta = readFile('atleta.html');

// Remover o bloco pace-nav injetado
atleta = atleta.replace(/\n<!-- PACE NAV -->[\s\S]*?<!-- \/PACE NAV -->/, '');

writeFile('atleta.html', atleta);

// ═══════════════════════════════════════
// VERIFICAÇÃO FINAL
// ═══════════════════════════════════════
console.log('\n🔍 VERIFICAÇÃO:');

const files = ['ia.html', 'perfil.html', 'corridas-abertas.html', 'exames.html', 'cobaia.html', 'atleta.html'];
for (const f of files) {
  const content = readFile(f);
  const paceNavCount = (content.match(/pace-nav/g) || []).length;
  const origNavCount = (content.match(/class="bnav"|class="bottomnav"|class="nav"|class="fixed bottom-0/g) || []).length;
  const tokenIssue = f === 'ia.html' ? (content.includes("getItem('token')") ? '❌ TOKEN ERRADO' : '✅ token OK') : '';
  console.log('  ' + f + ': pace-nav=' + paceNavCount + ' orig-nav=' + origNavCount + ' ' + tokenIssue);
}

console.log('\n✅ FASE 1 COMPLETA!');
