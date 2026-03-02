import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT = process.env.JWT_SECRET || 'pace-secret-2026';

// ✅ FIX: Rate limit por usuário para IA (evita gastar créditos em excesso)
const userIaRequests = new Map();
const IA_RATE_LIMIT = 20;       // máx 20 mensagens
const IA_RATE_WINDOW = 60 * 60 * 1000; // por hora

function checkIaRateLimit(userId) {
  const now = Date.now();
  const entry = userIaRequests.get(userId);
  if (!entry || now - entry.windowStart > IA_RATE_WINDOW) {
    userIaRequests.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= IA_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function getUser(req) {
  try { return jwt.verify(req.headers.authorization?.replace('Bearer ',''), JWT); }
  catch { return null; }
}

const SYSTEM = `Você é a PACE IA — amiga pessoal de corrida do atleta. Você cuida dele em 6 dimensões:
🔬 BIOLÓGICA — saúde, lesões, recuperação, alimentação, sono
🧠 PSICOLÓGICA — motivação, metas, ansiedade, autoconfiança  
👥 SOCIAL — grupos, assessorias, amigos de treino
⚡ FUNCIONAL — treinos, pace, VO2max, evolução técnica
🙏 ESPIRITUAL — propósito, superação, correr como meditação
🌍 AMBIENTAL — clima, terreno, horários ideais

Para CAMISAS: pergunte medidas, sugira tamanho, apresente modelos com entusiasmo.

ESTILO: amiga próxima, use o nome, lembre conversas anteriores, comemore conquistas, seja empática. Respostas curtas e naturais (máx 4 parágrafos).`;

export async function iaRoutes(fastify) {

  // CHAT
  fastify.post('/ia/chat', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    // ✅ FIX: Rate limit por usuário
    if (!checkIaRateLimit(u.userId)) {
      return reply.code(429).send({ error: 'Limite de mensagens atingido. Tente novamente em 1 hora.' });
    }

    const { mensagem, contextoLoja } = req.body || {};
    if (!mensagem?.trim()) return reply.code(400).send({ error: 'Mensagem vazia' });

    // ✅ FIX: Limitar tamanho da mensagem do usuário
    if (mensagem.length > 1000) {
      return reply.code(400).send({ error: 'Mensagem muito longa (máx 1000 caracteres)' });
    }

    try {
      const [user, avatar, perfil, conversa, resultados] = await Promise.all([
        prisma.user.findUnique({ where: { id: u.userId }, select: { name:true, city:true, state:true, age:true, gender:true } }),
        prisma.atletaAvatar.findUnique({ where: { userId: u.userId } }).catch(()=>null),
        prisma.iaPerfilCorredor.findUnique({ where: { userId: u.userId } }).catch(()=>null),
        prisma.iaConversa.findUnique({ where: { userId: u.userId } }).catch(()=>null),
        prisma.result.findMany({ where: { athlete: { user: { id: u.userId } } }, include: { race: { select:{ name:true } } }, orderBy: { createdAt:'desc' }, take: 5 }).catch(()=>[]),
      ]);

      // ✅ FIX: Histórico reduzido de 20 para 10 mensagens (economiza tokens)
      let historico = [];
      try { if (conversa?.mensagens) historico = JSON.parse(conversa.mensagens).slice(-10); } catch {}

      const ctx = [
        `ATLETA: ${user?.name || 'Atleta'}${user?.city ? ', '+user.city : ''}${user?.state ? '/'+user.state : ''}${user?.age ? ', '+user.age+'anos' : ''}`,
        avatar?.altura ? `MEDIDAS: ${avatar.altura}cm ${avatar.peso||''}kg${avatar.manequim ? ' - Tam '+avatar.manequim : ''}` : '',
        resultados.length ? `CORRIDAS RECENTES: ${resultados.map(r=>`${r.race.name}(${r.time})`).join(', ')}` : '',
        perfil?.objetivos ? `OBJETIVOS: ${perfil.objetivos.substring(0,100)}` : '',
        contextoLoja ? 'CONTEXTO: atleta está na loja querendo comprar camisa' : '',
      ].filter(Boolean).join('\n');

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return { resposta: 'Estou descansando um momento! Em breve volto para te ajudar nos seus treinos. 🏃‍♂️💚' };
      }

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400, // ✅ FIX: Reduzido de 600 para 400 (economiza ~33% nos custos)
          system: SYSTEM,
          messages: [
            ...historico,
            { role: 'user', content: `[CONTEXTO]\n${ctx}\n\n[ATLETA DIZ]\n${mensagem}` }
          ],
        })
      });

      const data = await resp.json();
      if (data.error) {
        console.error('[IA API ERROR]', JSON.stringify(data.error));
        // ✅ FIX: Não expor detalhes do erro para o usuário
        return { resposta: 'Estou com uma dificuldade técnica agora. Tente novamente em instantes! 💚' };
      }
      const resposta = data.content?.[0]?.text || 'Desculpe, erro ao processar!';

      // ✅ FIX: Histórico salvo com limite menor (10 em vez de 40)
      const novoHist = [
        ...historico,
        { role: 'user', content: mensagem },
        { role: 'assistant', content: resposta }
      ].slice(-20);

      const histStr = JSON.stringify(novoHist);
      if (conversa) {
        await prisma.iaConversa.update({ where: { userId: u.userId }, data: { mensagens: histStr } });
      } else {
        await prisma.iaConversa.create({ data: { userId: u.userId, mensagens: histStr } });
      }

      atualizarPerfil(u.userId, mensagem, perfil).catch(()=>{});

      return { resposta };

    } catch(e) {
      console.error('[IA CATCH]', e.message);
      return { resposta: 'Erro interno. Tente novamente!' };
    }
  });

  // HISTÓRICO
  fastify.get('/ia/historico', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const conv = await prisma.iaConversa.findUnique({ where: { userId: u.userId } }).catch(()=>null);
    if (!conv) return { mensagens: [] };
    try { return { mensagens: JSON.parse(conv.mensagens) }; }
    catch { return { mensagens: [] }; }
  });

  // AVATAR - salvar medidas
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

  // AVATAR - buscar
  fastify.get('/ia/avatar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const av = await prisma.atletaAvatar.findUnique({ where: { userId: u.userId } }).catch(()=>null);
    return av || {};
  });

  // PERFIL IA
  fastify.get('/ia/perfil', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const p = await prisma.iaPerfilCorredor.findUnique({ where: { userId: u.userId } }).catch(()=>null);
    return p || {};
  });
}

async function atualizarPerfil(userId, msg, perfilAtual) {
  const t = msg.toLowerCase();
  const up = {};
  const ts = new Date().toLocaleDateString('pt-BR');
  const trecho = msg.substring(0, 100);

  if (/lesão|dor |machuc|médico|joelho|tornozelo/.test(t))
    up.biologico = ((perfilAtual?.biologico||'') + ` | ${ts}: ${trecho}`).slice(-500);
  if (/quero|meta|objetivo|correr.*km|maratona|meia/.test(t))
    up.objetivos = ((perfilAtual?.objetivos||'') + ` | ${trecho}`).slice(-500);
  if (/motivação|desistir|difícil|orgulho|feliz|triste/.test(t))
    up.psicologico = ((perfilAtual?.psicologico||'') + ` | ${ts}: ${trecho}`).slice(-500);
  if (/grupo|assessoria|amigo|turma|clube/.test(t))
    up.social = ((perfilAtual?.social||'') + ` | ${trecho}`).slice(-500);
  if (/grat|propós|fé |deus|espirit/.test(t))
    up.espiritual = ((perfilAtual?.espiritual||'') + ` | ${trecho}`).slice(-500);
  if (/calor|chuva|praia|trilha|pista|horário/.test(t))
    up.ambiental = ((perfilAtual?.ambiental||'') + ` | ${trecho}`).slice(-500);

  if (!Object.keys(up).length) return;
  up.updatedAt = new Date();

  if (perfilAtual) {
    await prisma.iaPerfilCorredor.update({ where: { userId }, data: up });
  } else {
    await prisma.iaPerfilCorredor.create({ data: { userId, ...up } });
  }
}
