import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT = process.env.JWT_SECRET || 'pace-secret-2026';

const userIaRequests = new Map();
const IA_RATE_LIMIT  = 20;
const IA_RATE_WINDOW = 60 * 60 * 1000;

function checkIaRateLimit(userId) {
  const now = Date.now();
  const entry = userIaRequests.get(userId);
  if (!entry || now - entry.windowStart > IA_RATE_WINDOW) {
    userIaRequests.set(userId, { count: 1, windowStart: now });
    return { ok: true, restantes: IA_RATE_LIMIT - 1 };
  }
  if (entry.count >= IA_RATE_LIMIT) return { ok: false, restantes: 0 };
  entry.count++;
  return { ok: true, restantes: IA_RATE_LIMIT - entry.count };
}

function getUser(req) {
  try { return jwt.verify(req.headers.authorization?.replace('Bearer ', ''), JWT); }
  catch { return null; }
}

function calcularNivel(resultados) {
  if (!resultados?.length) return 'iniciante';
  const tempos10k = resultados.filter(r => r.distance?.includes('10')).map(r => r.time);
  if (!tempos10k.length) return resultados.length >= 10 ? 'intermediario' : 'iniciante';
  const melhor = tempos10k.sort()[0];
  const [h, m] = melhor.split(':').map(Number);
  const min = h * 60 + m;
  if (min < 40) return 'elite';
  if (min < 50) return 'avancado';
  if (min < 60) return 'intermediario';
  return 'iniciante';
}

function tempoParaSeg(t) {
  if (!t) return null;
  const p = t.split(':').map(Number);
  if (p.length === 3) return p[0]*3600 + p[1]*60 + p[2];
  if (p.length === 2) return p[0]*60 + p[1];
  return null;
}

function detectarIntencao(msg) {
  const t = msg.toLowerCase();
  if (/lesão|dor |machuc|joelho|tornozelo|fascite|canelite|tendinit/.test(t)) return 'lesao';
  if (/pace|ritmo|treino|planilha|intervalo|fartlek|longao/.test(t)) return 'treino';
  if (/comer|nutri|carboid|proteína|hidrat|suplemento|gel/.test(t)) return 'nutricao';
  if (/corrida|prova|inscrição|evento|próxima|quando|calendar/.test(t)) return 'eventos';
  if (/ranking|posição|faixa|pódio|classific|pontos/.test(t)) return 'ranking';
  if (/motivaç|desistir|difícil|cansado|vontade|inspirar/.test(t)) return 'motivacao';
  if (/camisa|kit|tamanho|medida|loja|comprar/.test(t)) return 'loja';
  return 'geral';
}

const SYSTEM_BASE = `Você é a PACE IA — a melhor amiga e treinadora pessoal de corredores de rua brasileiros.

Você cuida do atleta em 6 dimensões:
🔬 BIOLÓGICA — saúde, lesões, recuperação, alimentação, sono
🧠 PSICOLÓGICA — motivação, metas, ansiedade pré-prova, autoconfiança
👥 SOCIAL — grupos, assessorias, amigos de treino, comunidade
⚡ FUNCIONAL — treinos, pace, VO2max, periodização, evolução técnica
🙏 ESPIRITUAL — propósito, superação, correr como meditação
🌍 AMBIENTAL — clima de Sergipe, terreno, horários ideais, calor nordestino

REGRAS:
- Use o nome do atleta sempre
- Respostas curtas e diretas (máx 4 parágrafos)
- Comemore TODA conquista por menor que seja
- Se tiver dados do atleta, USE-OS para personalizar
- Nunca invente resultados ou tempos
- Para lesões: oriente mas indique fisioterapeuta
- Contexto brasileiro: calor, corridas na orla, grupões às 5h da manhã`;

const SYSTEM_TREINO = SYSTEM_BASE + `

MODO COACH ATIVO:
- Calcule paces exatos em min/km
- Sugira zonas de treinamento (Z1-Z5)
- Monte treinos semanais estruturados
- Considere o calor de Sergipe (reduza intensidade 10-15% no calor extremo)`;

const SYSTEM_LESAO = SYSTEM_BASE + `

MODO SAÚDE ATIVO:
- Identifique a lesão com perguntas específicas
- Dê primeiros cuidados práticos (RICE)
- Indique SEMPRE um fisioterapeuta esportivo
- Sugira exercícios de fortalecimento preventivos
- Nunca diga que pode continuar treinando com dor forte`;

const SYSTEM_NUTRICAO = SYSTEM_BASE + `

MODO NUTRIÇÃO ATIVO:
- Hidratação é prioridade no calor nordestino
- Exemplos com comidas acessíveis do dia a dia
- Horários de refeição em relação ao treino
- Para provas longas: estratégia de abastecimento detalhada`;

function getSystemPrompt(intencao) {
  if (intencao === 'treino') return SYSTEM_TREINO;
  if (intencao === 'lesao') return SYSTEM_LESAO;
  if (intencao === 'nutricao') return SYSTEM_NUTRICAO;
  return SYSTEM_BASE;
}

async function buscarProximasCorridas(estado = 'SE', limite = 4) {
  try {
    const corridas = await prisma.corridaAberta.findMany({
      where: { ativa: true, data: { gte: new Date() }, estado },
      orderBy: { data: 'asc' }, take: limite,
      select: { nome: true, data: true, cidade: true, distancias: true }
    });
    return corridas.map(c => `📍 ${c.nome} | ${new Date(c.data).toLocaleDateString('pt-BR')} | ${c.cidade} | ${c.distancias}`).join('\n');
  } catch { return ''; }
}

async function montarContexto(userId, contextoLoja, intencao) {
  const [user, avatar, perfil, resultados] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name:true, city:true, state:true, age:true, gender:true } }),
    prisma.atletaAvatar.findUnique({ where: { userId } }).catch(()=>null),
    prisma.iaPerfilCorredor.findUnique({ where: { userId } }).catch(()=>null),
    prisma.result.findMany({ where: { athlete: { user: { id: userId } } }, include: { race: { select:{ name:true } } }, orderBy: { createdAt:'desc' }, take: 8 }).catch(()=>[]),
  ]);

  const nivel = calcularNivel(resultados);
  const melhores = {};
  for (const r of resultados) {
    const d = r.distance || 'outros';
    const seg = tempoParaSeg(r.time);
    if (seg && (!melhores[d] || seg < melhores[d].seg)) {
      melhores[d] = { tempo: r.time, seg, prova: r.race?.name };
    }
  }

  const linhas = [
    `ATLETA: ${user?.name || 'Atleta'}${user?.city ? ', '+user.city : ''}${user?.state ? '/'+user.state : ''}${user?.age ? ', '+user.age+' anos' : ''}${user?.gender ? ', '+user.gender : ''}`,
    `NÍVEL: ${nivel}`,
    Object.keys(melhores).length ? `MELHORES TEMPOS: ${Object.entries(melhores).map(([d,v])=>`${d} → ${v.tempo}`).join(' | ')}` : '',
    `TOTAL DE PROVAS: ${resultados.length}`,
    avatar?.altura ? `CORPO: ${avatar.altura}cm, ${avatar.peso||'?'}kg${avatar.manequim ? ', Tamanho '+avatar.manequim : ''}` : '',
    perfil?.objetivos   ? `OBJETIVOS: ${perfil.objetivos.substring(0,150)}`   : '',
    perfil?.biologico   ? `SAÚDE: ${perfil.biologico.substring(0,100)}`       : '',
    perfil?.psicologico ? `MENTAL: ${perfil.psicologico.substring(0,100)}`    : '',
    contextoLoja ? 'CONTEXTO: atleta está na loja querendo comprar camisa' : '',
    intencao === 'eventos' ? `\nPRÓXIMAS CORRIDAS:\n${await buscarProximasCorridas(user?.state||'SE')}` : '',
  ].filter(Boolean).join('\n');

  return { ctx: linhas, user, nivel };
}

export async function iaRoutes(fastify) {

  fastify.post('/ia/chat', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    const rate = checkIaRateLimit(u.userId);
    if (!rate.ok) return reply.code(429).send({ error: 'Limite de mensagens atingido. Tente em 1 hora.', restantes: 0 });

    const { mensagem, contextoLoja } = req.body || {};
    if (!mensagem?.trim()) return reply.code(400).send({ error: 'Mensagem vazia' });
    if (mensagem.length > 1000) return reply.code(400).send({ error: 'Mensagem muito longa (máx 1000 caracteres)' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { resposta: 'Estou descansando! Em breve volto para te ajudar. 🏃💚', restantes: rate.restantes };

    try {
      const intencao = detectarIntencao(mensagem);
      const system = getSystemPrompt(intencao);
      const { ctx, user, nivel } = await montarContexto(u.userId, contextoLoja, intencao);

      const conversa = await prisma.iaConversa.findUnique({ where: { userId: u.userId } }).catch(()=>null);
      let historico = [];
      try { if (conversa?.mensagens) historico = JSON.parse(conversa.mensagens).slice(-10); } catch {}

      const perfil = await prisma.iaPerfilCorredor.findUnique({ where: { userId: u.userId } }).catch(()=>null);

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          system,
          messages: [
            ...historico,
            { role: 'user', content: `[CONTEXTO]\n${ctx}\n\n[MENSAGEM]\n${mensagem}` }
          ],
        })
      });

      const data = await resp.json();
      if (data.error) {
        console.error('[IA ERROR]', JSON.stringify(data.error));
        return { resposta: 'Dificuldade técnica agora. Tente em instantes! 💚', restantes: rate.restantes };
      }

      const resposta = data.content?.[0]?.text || 'Erro ao processar!';

      const novoHist = [...historico, { role:'user', content: mensagem }, { role:'assistant', content: resposta }].slice(-20);
      const histStr = JSON.stringify(novoHist);
      if (conversa) {
        await prisma.iaConversa.update({ where: { userId: u.userId }, data: { mensagens: histStr } });
      } else {
        await prisma.iaConversa.create({ data: { userId: u.userId, mensagens: histStr } });
      }

      atualizarPerfil(u.userId, mensagem, perfil).catch(()=>{});
      registrarComportamento(u.userId, intencao, mensagem).catch(()=>{});

      return { resposta, intencao, nivel, restantes: rate.restantes };

    } catch(e) {
      console.error('[IA CATCH]', e.message);
      return { resposta: 'Erro interno. Tente novamente!', restantes: rate.restantes };
    }
  });

  fastify.post('/ia/analise-completa', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return reply.code(503).send({ error: 'IA não configurada' });

    try {
      const { ctx, user } = await montarContexto(u.userId, false, 'treino');
      const corridas = await buscarProximasCorridas(user?.state || 'SE', 6);

      const prompt = `${ctx}\n\nPRÓXIMAS CORRIDAS:\n${corridas}\n\nFaça uma análise COMPLETA e PERSONALIZADA. Use os dados reais acima.\n\n1. 🏃 Quem é esse atleta — perfil atual\n2. ✅ Pontos fortes\n3. 🎯 Meta realista em 90 dias — tempo específico\n4. 📅 Plano semanal — 5 dias detalhados\n5. 🍌 Nutrição básica — antes/durante/depois\n6. 🏁 Próximas corridas recomendadas\n7. 💪 Mensagem motivacional personalizada`;

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, system: SYSTEM_TREINO, messages: [{ role:'user', content: prompt }] })
      });

      const data = await resp.json();
      return { analise: data.content?.[0]?.text || 'Erro ao gerar análise.', atleta: user?.name, geradoEm: new Date().toISOString() };
    } catch(e) {
      return reply.code(500).send({ error: e.message });
    }
  });

  fastify.post('/ia/chance-podio', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return reply.code(503).send({ error: 'IA não configurada' });

    const { distancia } = req.body || {};

    try {
      const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { name:true, age:true, gender:true } });
      const meusResultados = await prisma.result.findMany({
        where: { athlete: { user: { id: u.userId } }, ...(distancia ? { distance: { contains: distancia } } : {}) },
        orderBy: { createdAt:'desc' }, take: 5
      }).catch(()=>[]);

      const faixaMin = user?.age ? user.age - (user.age % 10) : 30;
      const faixaMax = faixaMin + 9;

      const atletasFaixa = await prisma.athlete.findMany({
        where: { age: { gte: faixaMin, lte: faixaMax } },
        include: { results: { where: distancia ? { distance: { contains: distancia } } : {}, orderBy: { createdAt:'desc' }, take: 1 } },
        take: 30
      }).catch(()=>[]);

      const temposFaixa = atletasFaixa.map(a => a.results?.[0]?.time).filter(Boolean).sort();
      const meuMelhor = meusResultados[0]?.time || null;

      let minhaPos = 1;
      if (meuMelhor) {
        const meuSeg = tempoParaSeg(meuMelhor);
        for (const t of temposFaixa) { if (tempoParaSeg(t) < meuSeg) minhaPos++; }
      }

      const prompt = `ATLETA: ${user?.name} | ${user?.age} anos | Faixa ${faixaMin}-${faixaMax} | ${user?.gender||'?'}\nMEU MELHOR (${distancia||'geral'}): ${meuMelhor||'sem registro'}\nPOSIÇÃO ESTIMADA: ${minhaPos}º de ${temposFaixa.length}\nTEMPOS DA FAIXA: ${temposFaixa.slice(0,10).join(', ')||'dados insuficientes'}\n\nResponda:\n1. Posição real agora\n2. Tenho chance de pódio? Qual tempo preciso?\n3. Quanto tempo de treino para chegar lá?\n4. Treino específico mais importante`;

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, system: SYSTEM_BASE, messages: [{ role:'user', content: prompt }] })
      });

      const data = await resp.json();
      return { analise: data.content?.[0]?.text, minhaPos, totalNaFaixa: temposFaixa.length, meuMelhorTempo: meuMelhor, faixaEtaria: `${faixaMin}-${faixaMax}` };
    } catch(e) {
      return reply.code(500).send({ error: e.message });
    }
  });

  fastify.get('/ia/dica-do-dia', async (req, reply) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { dica: 'Configure ANTHROPIC_API_KEY!', tema: 'config' };

    const temas = ['treino de velocidade', 'nutrição pré-prova', 'recuperação muscular', 'saúde mental do corredor', 'técnica de corrida', 'hidratação no calor nordestino'];
    const tema = temas[new Date().getDay() % temas.length];
    const dia = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 200, system: SYSTEM_BASE,
          messages: [{ role:'user', content: `É ${dia} em Sergipe, calor de rachar. Dê UMA dica prática sobre: ${tema}. Máximo 3 linhas, use 1 emoji, tom de amiga próxima. Seja específica.` }]
        })
      });
      const data = await resp.json();
      return { dica: data.content?.[0]?.text || 'Bora correr! 🏃', tema, dia };
    } catch {
      return { dica: 'Hidrate-se! No calor de Sergipe, beba 500ml 2h antes do treino. 💧', tema, dia };
    }
  });

  fastify.post('/ia/calcular-pace', async (req, reply) => {
    const { distancia, tempoAtual, objetivo, nivel } = req.body || {};
    if (!distancia) return reply.code(400).send({ error: 'Distância obrigatória' });

    let paceAtual = null;
    if (tempoAtual) {
      const seg = tempoParaSeg(tempoAtual);
      const km = parseFloat(distancia);
      if (seg && km) {
        const ps = seg / km;
        paceAtual = `${Math.floor(ps/60)}:${String(Math.round(ps%60)).padStart(2,'0')}/km`;
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { paceAtual, aviso: 'IA não configurada' };

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 500, system: SYSTEM_TREINO,
          messages: [{ role:'user', content: `Distância: ${distancia}km | Tempo: ${tempoAtual||'não informado'} | Objetivo: ${objetivo||'melhorar'} | Nível: ${nivel||'amador'}${paceAtual ? '\nPace atual: '+paceAtual : ''}\n\nDê:\n1. Pace atual e objetivo\n2. 4 zonas de treino em min/km\n3. 3 sessões práticas dessa semana` }]
        })
      });
      const data = await resp.json();
      return { paceAtual, analise: data.content?.[0]?.text, distancia, tempoAtual };
    } catch(e) {
      return { paceAtual, erro: e.message };
    }
  });

  fastify.get('/ia/historico', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const conv = await prisma.iaConversa.findUnique({ where: { userId: u.userId } }).catch(()=>null);
    if (!conv) return { mensagens: [] };
    try { return { mensagens: JSON.parse(conv.mensagens) }; }
    catch { return { mensagens: [] }; }
  });

  fastify.delete('/ia/historico', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    await prisma.iaConversa.deleteMany({ where: { userId: u.userId } }).catch(()=>{});
    return { success: true };
  });

  fastify.post('/ia/avatar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { altura, peso, medidaTorax, medidaOmbro, tipoCorpo, fotoEvento } = req.body || {};

    let manequim = null;
    const torax = parseFloat(medidaTorax);
    if (torax) {
      if (torax < 86) manequim = 'PP';
      else if (torax < 92) manequim = 'P';
      else if (torax < 98) manequim = 'M';
      else if (torax < 104) manequim = 'G';
      else if (torax < 110) manequim = 'GG';
      else manequim = 'XG';
    }

    const data = {
      altura: altura ? parseInt(altura) : null,
      peso: peso ? parseFloat(peso) : null,
      medidaTorax: torax || null,
      medidaOmbro: medidaOmbro ? parseFloat(medidaOmbro) : null,
      tipoCorpo: tipoCorpo || null,
      fotoEvento: fotoEvento || null,
      manequim,
      updatedAt: new Date(),
    };

    const existe = await prisma.atletaAvatar.findUnique({ where: { userId: u.userId } }).catch(()=>null);
    if (existe) {
      await prisma.atletaAvatar.update({ where: { userId: u.userId }, data });
    } else {
      await prisma.atletaAvatar.create({ data: { ...data, userId: u.userId } });
    }
    return { success: true, manequim };
  });

  fastify.get('/ia/avatar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const av = await prisma.atletaAvatar.findUnique({ where: { userId: u.userId } }).catch(()=>null);
    return av || {};
  });

  fastify.get('/ia/perfil', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const p = await prisma.iaPerfilCorredor.findUnique({ where: { userId: u.userId } }).catch(()=>null);
    return p || {};
  });

  fastify.get('/ia/comportamento', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const dados = await prisma.comportamentoCorredor.findMany({
      where: { userId: u.userId }, orderBy: { criadoEm: 'desc' }, take: 30
    }).catch(()=>[]);
    return dados;
  });

  fastify.get('/ia/status', async (req, reply) => {
    const u = getUser(req);
    if (!u) return { ativa: false, isPremium: false };
    const userDb = await prisma.user.findUnique({
      where: { id: u.userId },
      select: { isPremium:true, premiumUntil:true, name:true, tempo5k:true, fcMax:true, nivelAtleta:true }
    });
    const isPremium = userDb?.isPremium && (!userDb.premiumUntil || new Date(userDb.premiumUntil) > new Date());
    return {
      ativa: !!process.env.ANTHROPIC_API_KEY, isPremium,
      nome: userDb?.name, nivel: userDb?.nivelAtleta || 'iniciante',
      recursos: { chat:true, planilhaSemanal:isPremium, msgsHora: isPremium ? 60 : 5 }
    };
  });

  fastify.post('/ia/planilha', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessario' });
    const userDb = await prisma.user.findUnique({
      where: { id: u.userId },
      select: { isPremium:true, premiumUntil:true, name:true, tempo5k:true, tempo10k:true, fcMax:true, fcRepouso:true, nivelAtleta:true, city:true, state:true }
    });
    const isPremium = userDb?.isPremium && (!userDb.premiumUntil || new Date(userDb.premiumUntil) > new Date());
    if (!isPremium) return reply.code(403).send({ error: 'Exclusivo Premium!', isPremium: false });
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return reply.code(500).send({ error: 'IA indisponivel' });
    const { objetivo, observacoes } = req.body || {};
    let zonasTexto = '';
    if (userDb?.fcMax) {
      const fc = userDb.fcMax, fr = userDb.fcRepouso || Math.round(fc*0.35), res = fc - fr;
      const z = (a,b) => `${Math.round(fr+res*a)}-${Math.round(fr+res*b)}bpm`;
      zonasTexto = `FC max:${fc} repouso:${fr} | Z1:${z(.50,.64)} Z2:${z(.65,.75)} Z3:${z(.76,.84)} Z4:${z(.85,1)} Z5:${z(1.01,1.10)}`;
    }
    let pacesTexto = '';
    if (userDb?.tempo5k) {
      const [m,s] = userDb.tempo5k.split(':').map(Number);
      const pb = (m*60+(s||0))/5;
      const f = (v) => `${Math.floor(v/60)}:${Math.round(v%60).toString().padStart(2,'0')}`;
      pacesTexto = `Trote:${f(pb*1.45)} CCL:${f(pb*1.20)} CCM:${f(pb*1.08)} CCR:${f(pb*.97)} Z1:${f(pb*.89)} Z2:${f(pb*.84)}`;
    }
    const prompt = `Gere planilha semanal completa.\nAtleta: ${userDb?.name}, ${userDb?.city}/${userDb?.state}\nNivel: ${userDb?.nivelAtleta||'iniciante'}\n5km: ${userDb?.tempo5k||'?'}\n${zonasTexto}\nPaces: ${pacesTexto}\nObjetivo: ${objetivo||'Melhorar performance'}\nObs: ${observacoes||''}\n\nGere 7 dias detalhados com paces e zonas FC exatos calculados acima.`;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
        body: JSON.stringify({ model:'claude-opus-4-5', max_tokens:3000, system:'Voce e a melhor treinadora de corrida do Brasil. Gera planilhas profissionais detalhadas.', messages:[{role:'user',content:prompt}] })
      });
      const data = await res.json();
      return { success:true, planilha: data.content?.[0]?.text || 'Erro', isPremium:true };
    } catch(e) { return reply.code(500).send({ error: 'Erro ao gerar planilha' }); }
  });


}

async function atualizarPerfil(userId, msg, perfilAtual) {
  const t = msg.toLowerCase();
  const up = {};
  const ts = new Date().toLocaleDateString('pt-BR');
  const txt = msg.substring(0, 120);

  if (/lesão|dor |machuc|médico|joelho|tornozelo|fascite|canelite/.test(t))
    up.biologico = ((perfilAtual?.biologico||'') + ` | ${ts}: ${txt}`).slice(-500);
  if (/quero|meta|objetivo|correr.*km|maratona|meia|sub-/.test(t))
    up.objetivos = ((perfilAtual?.objetivos||'') + ` | ${txt}`).slice(-500);
  if (/motivaç|desistir|difícil|orgulho|feliz|triste|cansado/.test(t))
    up.psicologico = ((perfilAtual?.psicologico||'') + ` | ${ts}: ${txt}`).slice(-500);
  if (/grupo|assessoria|amigo|turma|clube|pace/.test(t))
    up.social = ((perfilAtual?.social||'') + ` | ${txt}`).slice(-500);
  if (/grat|propós|fé |deus|espirit|sentido/.test(t))
    up.espiritual = ((perfilAtual?.espiritual||'') + ` | ${txt}`).slice(-500);
  if (/calor|chuva|praia|trilha|pista|horário|manhã|tarde/.test(t))
    up.ambiental = ((perfilAtual?.ambiental||'') + ` | ${txt}`).slice(-500);

  if (!Object.keys(up).length) return;
  up.updatedAt = new Date();

  if (perfilAtual) {
    await prisma.iaPerfilCorredor.update({ where: { userId }, data: up });
  } else {
    await prisma.iaPerfilCorredor.create({ data: { userId, ...up } });
  }
}

async function registrarComportamento(userId, intencao, mensagem) {
  try {
    await prisma.comportamentoCorredor.create({
      data: {
        userId,
        intencao,
        topico: mensagem.substring(0, 100),
        hora: new Date().getHours(),
        diaSemana: new Date().getDay(),
        criadoEm: new Date(),
      }
    });
  } catch {}
}
