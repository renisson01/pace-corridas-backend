const fs = require('fs');
const vm = require('vm');

console.log('🎯 DAILY COACH — "Pegando na mão do usuário"\n');

// ═══════════════════════════════════════
// 1. BACKEND: Endpoint /coach/daily que gera o briefing do dia
// ═══════════════════════════════════════
console.log('1. Backend — /coach/daily endpoint...');

let cobRoutes = fs.readFileSync('src/modules/cobaia/cobaia.routes.js', 'utf-8');

if (!cobRoutes.includes('/coach/daily')) {
  const dailyRoute = `
  // GET /coach/daily — Briefing personalizado do dia
  fastify.get('/coach/daily', async (req, reply) => {
    const u = getUser(req); if (!u) return reply.code(401).send({ error: 'Login necessário' });
    try {
      const userId = u.userId;
      const hoje = new Date(); hoje.setHours(0,0,0,0);
      const amanha = new Date(hoje); amanha.setDate(amanha.getDate()+1);
      const hora = new Date().getHours();
      
      // Buscar dados do usuário
      const [user, ultimoCheckin, treinos7d, agenda, ultimaSauna, proximaCorrida] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { name:true, age:true, tempo5k:true, tempo10k:true, isPremium:true } }),
        prisma.cobaiaDiario.findFirst({ where: { userId }, orderBy: { data: 'desc' } }),
        prisma.atividadeGPS.findMany({ where: { userId, iniciadoEm: { gte: new Date(Date.now() - 7*24*60*60*1000) } }, orderBy: { iniciadoEm: 'desc' }, take: 10 }),
        prisma.cobaiaAgenda.findMany({ where: { userId, data: { gte: hoje, lt: amanha } }, orderBy: { horario: 'asc' } }),
        prisma.cobaiaSauna.findFirst({ where: { userId }, orderBy: { data: 'desc' } }),
        prisma.corridaAberta.findFirst({ where: { data: { gte: hoje }, ativa: true }, orderBy: { data: 'asc' } })
      ]);
      
      const nome = (user?.name || 'Atleta').split(' ')[0];
      const saudacao = hora < 6 ? 'Boa madrugada' : hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
      
      // Calcular métricas da semana
      const kmSemana = treinos7d.reduce((s,t) => s + (t.distanciaKm||0), 0).toFixed(1);
      const treinosSemana = treinos7d.length;
      
      // Dias sem checkin
      const diasSemCheckin = ultimoCheckin ? Math.floor((Date.now() - new Date(ultimoCheckin.data).getTime()) / (24*60*60*1000)) : 999;
      
      // Dias sem sauna
      const diasSemSauna = ultimaSauna ? Math.floor((Date.now() - new Date(ultimaSauna.data).getTime()) / (24*60*60*1000)) : 999;
      
      // Construir briefing
      const cards = [];
      
      // Card 1: Saudação + resumo
      cards.push({
        type: 'greeting',
        icon: hora < 12 ? '☀️' : hora < 18 ? '🌤️' : '🌙',
        title: saudacao + ', ' + nome + '!',
        message: treinosSemana > 0 
          ? 'Essa semana: ' + kmSemana + 'km em ' + treinosSemana + ' treinos. '
          : 'Ainda sem treino essa semana. Bora mudar isso? ',
        color: '#F7931A'
      });
      
      // Card 2: Ação imediata
      if (diasSemCheckin >= 1) {
        cards.push({
          type: 'action',
          icon: '📊',
          title: 'Faça seu check-in diário',
          message: diasSemCheckin === 999 ? 'Seu primeiro check-in! Registre peso, sono e humor.' : 'Faz ' + diasSemCheckin + ' dia(s) sem check-in. Seus dados alimentam a IA.',
          action: 'checkin',
          color: '#E74C3C',
          priority: 'high'
        });
      } else {
        cards.push({
          type: 'status',
          icon: '✅',
          title: 'Check-in feito hoje!',
          message: 'Sono: ' + (ultimoCheckin?.horasSono || '--') + 'h | Humor: ' + (ultimoCheckin?.humor || '--') + '/5',
          color: '#27AE60'
        });
      }
      
      // Card 3: Treino
      if (hora >= 5 && hora <= 21) {
        const treinoHoje = treinos7d.find(t => { const d = new Date(t.iniciadoEm); d.setHours(0,0,0,0); return d.getTime() === hoje.getTime(); });
        if (treinoHoje) {
          cards.push({
            type: 'done',
            icon: '🏃',
            title: 'Treino de hoje: ' + treinoHoje.distanciaKm.toFixed(1) + 'km',
            message: 'Pace: ' + (treinoHoje.paceMedio || '--') + ' | Tempo: ' + Math.round(treinoHoje.duracaoSeg/60) + 'min',
            color: '#27AE60'
          });
        } else {
          const sugestao = treinosSemana >= 4 ? 'Dia de descanso ativo. Caminhada ou yoga.' : treinosSemana >= 2 ? 'Corrida fácil zona 2, 30-40min.' : 'Hora de treinar! Corrida leve pra manter consistência.';
          cards.push({
            type: 'suggestion',
            icon: '🏃',
            title: 'Treino de hoje',
            message: sugestao,
            action: 'treino',
            color: '#F7931A'
          });
        }
      }
      
      // Card 4: Sauna
      if (diasSemSauna >= 2 && hora >= 14) {
        cards.push({
          type: 'suggestion',
          icon: '🔥',
          title: 'Sauna recomendada',
          message: diasSemSauna >= 7 ? 'Faz ' + diasSemSauna + ' dias sem sauna. HSPs precisam de estímulo regular.' : 'Bom dia pra sauna. Protocolo longevidade: 80°C, 20min.',
          action: 'sauna',
          color: '#E74C3C'
        });
      }
      
      // Card 5: Próxima corrida
      if (proximaCorrida) {
        const diasPra = Math.floor((new Date(proximaCorrida.data) - Date.now()) / (24*60*60*1000));
        if (diasPra <= 30) {
          cards.push({
            type: 'event',
            icon: '🏁',
            title: proximaCorrida.nome || 'Próxima corrida',
            message: diasPra === 0 ? 'HOJE! Boa prova!' : 'Em ' + diasPra + ' dia(s) — ' + (proximaCorrida.cidade || '') + (proximaCorrida.estado ? '/' + proximaCorrida.estado : ''),
            color: '#6366f1'
          });
        }
      }
      
      // Card 6: Agenda do dia
      if (agenda.length > 0) {
        cards.push({
          type: 'agenda',
          icon: '📅',
          title: 'Agenda de hoje (' + agenda.length + ' itens)',
          items: agenda.map(a => ({ titulo: a.titulo, horario: a.horario || '', completado: a.completado })),
          color: '#06b6d4'
        });
      }
      
      // Card 7: Motivação (se não treinou)
      if (treinosSemana === 0 && hora >= 10) {
        const frases = [
          'Lembre-se: cada corrida reduz sua idade biológica. O melhor momento é agora.',
          'Consistência > intensidade. 15 minutos de corrida leve já mudam seu dia.',
          'Seu VO2max é construído nos dias que você não quer treinar.',
          'Bryan Johnson treina todo dia. Peter Attia também. E você?',
          'Dopamina natural: 30min de corrida = 4h de foco sem Vyvanse.'
        ];
        cards.push({
          type: 'motivation',
          icon: '💪',
          title: 'Motivação do dia',
          message: frases[new Date().getDay() % frases.length],
          color: '#E040FB'
        });
      }
      
      return { cards, timestamp: new Date().toISOString(), nome, isPremium: user?.isPremium };
      
    } catch(e) { return reply.code(500).send({ error: e.message }); }
  });
`;

  cobRoutes = cobRoutes.replace(/\n\}$/, dailyRoute + '\n}');
  fs.writeFileSync('src/modules/cobaia/cobaia.routes.js', cobRoutes);
  console.log('  ✅ GET /coach/daily criado');
} else {
  console.log('  ✅ Já existe');
}

// ═══════════════════════════════════════
// 2. FRONTEND: Daily Coach na Home do Atleta
// ═══════════════════════════════════════
console.log('\n2. Atleta home — Daily Coach cards...');

let atl = fs.readFileSync('public/atleta.html', 'utf-8');

// Adicionar seção Daily Coach no topo da home (após hero-hoje)
if (!atl.includes('dailyCoachCards')) {
  const coachHTML = `
  <!-- DAILY COACH -->
  <div class="section" id="dailyCoachSection">
    <div id="dailyCoachCards" style="display:flex;flex-direction:column;gap:8px"></div>
  </div>
`;

  // Inserir após o hero-hoje
  atl = atl.replace(
    '<!-- IA TREINADORA -->',
    coachHTML + '\n  <!-- IA TREINADORA -->'
  );

  // Adicionar JS pra carregar daily coach
  const coachJS = `
// ═══ DAILY COACH ═══
async function carregarDailyCoach() {
  try {
    var r = await fetch(API + '/coach/daily', { headers: { 'Authorization': 'Bearer ' + TOKEN } });
    var d = await r.json();
    if (d.error || !d.cards) return;
    
    var container = document.getElementById('dailyCoachCards');
    if (!container) return;
    
    var html = '';
    for (var i = 0; i < d.cards.length; i++) {
      var c = d.cards[i];
      html += '<div style="background:var(--card);border:1px solid var(--border);border-left:3px solid ' + c.color + ';border-radius:14px;padding:14px 16px;display:flex;gap:12px;align-items:flex-start">';
      html += '<div style="font-size:24px;flex-shrink:0;margin-top:2px">' + c.icon + '</div>';
      html += '<div style="flex:1">';
      html += '<div style="font-size:14px;font-weight:700;margin-bottom:4px">' + c.title + '</div>';
      
      if (c.message) {
        html += '<div style="font-size:12px;color:var(--muted2);line-height:1.5">' + c.message + '</div>';
      }
      
      if (c.items) {
        for (var j = 0; j < c.items.length; j++) {
          var item = c.items[j];
          html += '<div style="font-size:12px;color:var(--muted2);margin-top:3px">' + (item.completado ? '\\u2705' : '\\u25CB') + ' ' + (item.horario ? item.horario + ' ' : '') + item.titulo + '</div>';
        }
      }
      
      if (c.action === 'checkin') {
        html += '<button onclick="window.location.href=\\'/cobaia.html\\'" style="margin-top:8px;background:' + c.color + '22;color:' + c.color + ';border:1px solid ' + c.color + '44;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">Fazer check-in</button>';
      }
      if (c.action === 'treino') {
        html += '<button onclick="window.location.href=\\'/ia.html\\'" style="margin-top:8px;background:' + c.color + '22;color:' + c.color + ';border:1px solid ' + c.color + '44;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">Pedir treino pra IA</button>';
      }
      if (c.action === 'sauna') {
        html += '<button onclick="window.location.href=\\'/cobaia.html\\'" style="margin-top:8px;background:' + c.color + '22;color:' + c.color + ';border:1px solid ' + c.color + '44;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">Registrar sauna</button>';
      }
      
      html += '</div></div>';
    }
    
    container.innerHTML = html;
  } catch(e) { console.error('Daily coach error:', e); }
}
`;

  // Inserir JS antes do último </script>
  const lastScriptIdx = atl.lastIndexOf('</script>');
  atl = atl.substring(0, lastScriptIdx) + coachJS + '\n</script>' + atl.substring(lastScriptIdx + 9);

  // Chamar no DOMContentLoaded
  atl = atl.replace(
    'carregarCorridasProximas();',
    'carregarCorridasProximas();\n  carregarDailyCoach();'
  );

  fs.writeFileSync('public/atleta.html', atl);
  console.log('  ✅ Daily Coach cards na home');
}

// ═══════════════════════════════════════
// 3. IA WELCOME — Personalizar com nome
// ═══════════════════════════════════════
console.log('\n3. IA — Welcome personalizado...');

let iaHtml = fs.readFileSync('public/ia.html', 'utf-8');

if (!iaHtml.includes('nomeUsuario')) {
  // Adicionar personalização do welcome
  iaHtml = iaHtml.replace(
    "<h2>Olá, atleta! 👋</h2>",
    "<h2 id=\"iaWelcomeName\">Olá, atleta! 👋</h2>"
  );
  
  // Adicionar JS pra personalizar
  const welcomeJS = `
// Personalizar welcome
var nomeUsuario = JSON.parse(localStorage.getItem('pace_user') || '{}').name;
if (nomeUsuario) {
  var el = document.getElementById('iaWelcomeName');
  if (el) el.textContent = 'Olá, ' + nomeUsuario.split(' ')[0] + '! 👋';
}
`;
  
  // Inserir no script
  iaHtml = iaHtml.replace('// Verificar status premium', welcomeJS + '\n// Verificar status premium');
  
  fs.writeFileSync('public/ia.html', iaHtml);
  console.log('  ✅ Welcome com nome do usuário');
}

// ═══════════════════════════════════════
// VERIFICAÇÃO
// ═══════════════════════════════════════
console.log('\n══════════════════════════════════════════════');

const cobF = fs.readFileSync('src/modules/cobaia/cobaia.routes.js', 'utf-8');
console.log('  /coach/daily: ' + (cobF.includes('/coach/daily') ? '✅' : '❌'));

const atF = fs.readFileSync('public/atleta.html', 'utf-8');
console.log('  Daily Coach HTML: ' + (atF.includes('dailyCoachCards') ? '✅' : '❌'));
console.log('  Daily Coach JS: ' + (atF.includes('carregarDailyCoach') ? '✅' : '❌'));
console.log('  Auto-load: ' + (atF.includes('carregarDailyCoach()') ? '✅' : '❌'));

const iaF = fs.readFileSync('public/ia.html', 'utf-8');
console.log('  IA welcome nome: ' + (iaF.includes('nomeUsuario') ? '✅' : '❌'));

console.log('\n✅ DAILY COACH CONSTRUÍDO!');
console.log('\nO que o usuário vê ao abrir o app:');
console.log('  1. "Bom dia, Renisson!" + resumo da semana');
console.log('  2. "Faça seu check-in" (se não fez hoje)');
console.log('  3. Sugestão de treino baseada na semana');
console.log('  4. "Sauna recomendada" (se faz dias sem)');
console.log('  5. Próxima corrida com countdown');
console.log('  6. Agenda do dia');
console.log('  7. Motivação (se não treinou)');
