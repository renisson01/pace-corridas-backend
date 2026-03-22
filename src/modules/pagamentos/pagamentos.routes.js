import prisma from '../../lib/prisma.js';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

const BASE_URL = process.env.BASE_URL || 'https://web-production-990e7.up.railway.app';
const TAXA_PLATAFORMA = 0.15;
const votosX1 = { pedro: 0, tiago: 0, doacoes: [] };

// Lê o token em runtime (não no carregamento do módulo)
function getMPClient() {
  const token = process.env.MP_ACCESS_TOKEN || '';
  if (!token) throw new Error('MP_ACCESS_TOKEN não configurado');
  return new MercadoPagoConfig({ accessToken: token });
}

function mpConfigurado() {
  return !!(process.env.MP_ACCESS_TOKEN || '');
}

export async function pagamentosRoutes(fastify) {

  fastify.post('/pagamentos/loja', async (req, reply) => {
    if (!mpConfigurado()) return reply.code(503).send({ error: 'Pagamentos não configurados. Configure MP_ACCESS_TOKEN no Railway.' });
    try {
      const { produtoId, tamanho, cor, quantidade = 1, compradorNome, compradorEmail, pedidoId } = req.body || {};
      if (!produtoId) return reply.code(400).send({ error: 'produtoId obrigatório' });
      const p = await prisma.produto.findUnique({ where: { id: produtoId } }).catch(() => null);
      if (!p) return reply.code(404).send({ error: 'Produto não encontrado' });
      const ref = pedidoId ? `loja-${pedidoId}` : `loja-${produtoId}-${Date.now()}`;
      const preference = new Preference(getMPClient());
      const result = await preference.create({ body: { items: [{ id: p.id, title: `${p.nome}${tamanho ? ' — Tam. '+tamanho : ''}${cor ? ' / '+cor : ''}`, description: p.descricao || 'Produto PACE', quantity: parseInt(quantidade), unit_price: parseFloat(p.preco), currency_id: 'BRL', category_id: 'fashion' }], payer: { name: compradorNome || '', email: compradorEmail || '' }, payment_methods: { installments: 12 }, back_urls: { success: `${BASE_URL}/loja.html?pagamento=sucesso`, failure: `${BASE_URL}/loja.html?pagamento=erro`, pending: `${BASE_URL}/loja.html?pagamento=pendente` }, auto_return: 'approved', statement_descriptor: 'PACE CORRIDAS', external_reference: ref, notification_url: `${BASE_URL}/pagamentos/webhook` } });
      return { url: result.init_point, preferenceId: result.id, produto: p.nome, valor: p.preco, ref };
    } catch (e) {
      console.error('[MP LOJA]', e.message);
      return reply.code(500).send({ error: 'Erro ao gerar link de pagamento.' });
    }
  });

  fastify.post('/pagamentos/doacao-x1', async (req, reply) => {
    if (!mpConfigurado()) return reply.code(503).send({ error: 'Pagamentos não configurados.' });
    try {
      const { valor, atletaApoio, doadorNome, doadorEmail } = req.body || {};
      if (!valor || valor < 5) return reply.code(400).send({ error: 'Valor mínimo R$ 5,00' });
      if (!atletaApoio) return reply.code(400).send({ error: 'atletaApoio obrigatório' });
      const valorTotal = parseFloat(valor);
      const valorAtleta = parseFloat((valorTotal * (1 - TAXA_PLATAFORMA)).toFixed(2));
      const atletaNome = atletaApoio === 'pedro' ? 'Pedrinho 19km' : 'Tiago Portões 17km';
      const externalRef = `x1-${atletaApoio}-${Date.now()}`;

      // Gerar pagamento Pix real com copia e cola
      const paymentApi = new Payment(getMPClient());
      const result = await paymentApi.create({ body: {
        transaction_amount: valorTotal,
        description: `Apoio X1 — ${atletaNome}`,
        payment_method_id: 'pix',
        external_reference: externalRef,
        notification_url: `${BASE_URL}/pagamentos/webhook`,
        payer: {
          email: doadorEmail || 'torcedor@pacecorridas.com.br',
          first_name: doadorNome || 'Torcedor',
        }
      }});

      const pixData = result?.point_of_interaction?.transaction_data;
      const qrCode = pixData?.qr_code;         // código copia e cola
      const qrCodeBase64 = pixData?.qr_code_base64; // imagem base64
      const ticketUrl = result?.transaction_details?.external_resource_url || '';

      if (!qrCode) {
        console.error('[MP DOACAO PIX] Sem qr_code na resposta:', JSON.stringify(result));
        return reply.code(500).send({ error: 'Pix não gerado. Tente novamente.' });
      }

      return {
        ok: true,
        paymentId: result.id,
        qrCode,          // copia e cola
        qrCodeBase64,    // imagem QR (base64 png)
        ticketUrl,       // link alternativo
        valorTotal,
        valorAtleta,
        taxaPlataforma: parseFloat((valorTotal * TAXA_PLATAFORMA).toFixed(2)),
        atleta: atletaApoio,
        atletaNome,
        externalRef
      };
    } catch (e) {
      console.error('[MP DOACAO]', e.message);
      return reply.code(500).send({ error: e.message });
    }
  });

  fastify.get('/pagamentos/x1/votos', async (req, reply) => {
    try {
      const doacoes = await prisma.pagamentoRegistro.findMany({ where: { tipo: 'x1', status: 'aprovado' }, orderBy: { criadoEm: 'desc' } }).catch(() => []);
      const placar = { pedro: 0, tiago: 0, totalArrecadado: 0, doacoes: [] };
      doacoes.forEach(d => {
        if (d.atletaRef === 'pedro') placar.pedro += d.valor;
        else if (d.atletaRef === 'tiago') placar.tiago += d.valor;
        placar.totalArrecadado += d.valor;
        placar.doacoes.push({ atleta: d.atletaRef, valor: d.valor, doador: d.doadorNome || 'Anônimo', quando: d.criadoEm });
      });
      if (placar.totalArrecadado === 0 && votosX1.doacoes.length > 0) return { ...votosX1, fonte: 'memoria' };
      return { ...placar, fonte: 'banco' };
    } catch (e) {
      return { pedro: votosX1.pedro, tiago: votosX1.tiago, doacoes: votosX1.doacoes };
    }
  });

  fastify.post('/pagamentos/webhook', async (req, reply) => {
    reply.code(200).send({ ok: true });
    try {
      const { type, data } = req.body || {};
      if (type !== 'payment' || !data?.id) return;
      const paymentApi = new Payment(getMPClient());
      const payment = await paymentApi.get({ id: data.id });
      console.log('[WEBHOOK] Status:', payment.status, '| Ref:', payment.external_reference, '| R$', payment.transaction_amount);
      if (payment.status !== 'approved') return;
      const ref = payment.external_reference || '';
      const valor = parseFloat(payment.transaction_amount || 0);
      const doadorEmail = payment.payer?.email || '';
      const doadorNome = payment.payer?.first_name || 'Anônimo';
      if (ref.startsWith('loja-')) {
        const pedidoId = ref.replace('loja-', '').split('-')[0];
        await prisma.pedido.updateMany({ where: { id: pedidoId }, data: { status: 'pago' } }).catch(() => {});
        await prisma.pedidoCompleto.updateMany({ where: { id: pedidoId }, data: { status: 'pago' } }).catch(() => {});
        await prisma.pagamentoRegistro.upsert({ where: { paymentId: String(data.id) }, create: { paymentId: String(data.id), tipo: 'loja', valor, doadorNome, doadorEmail, ref, status: 'aprovado' }, update: { status: 'aprovado' } }).catch(() => {});
        console.log('[WEBHOOK] ✅ Loja paga:', ref);
      }
      if (ref.startsWith('x1-')) {
        const atletaRef = ref.split('-')[1];
        if (atletaRef === 'pedro') votosX1.pedro += valor;
        else if (atletaRef === 'tiago') votosX1.tiago += valor;
        votosX1.doacoes.push({ atleta: atletaRef, valor, doador: doadorNome, quando: new Date() });
        await prisma.pagamentoRegistro.upsert({ where: { paymentId: String(data.id) }, create: { paymentId: String(data.id), tipo: 'x1', atletaRef, valor, doadorNome, doadorEmail, ref, status: 'aprovado' }, update: { status: 'aprovado' } }).catch(() => {});
        console.log('[WEBHOOK] ✅ X1 doação:', atletaRef, 'R$', valor);
      }

      // === COACH ADESÃO ===
      if (ref.startsWith('coach-adesao-')) {
        const userId = ref.split('-')[2];
        const perfil = await prisma.coachProfile.findUnique({ where: { userId } }).catch(() => null);
        if (perfil) {
          await prisma.coachSubscription.upsert({
            where: { coachId: perfil.id },
            create: { coachId: perfil.id, signupFeePaid: true, status: 'ativo' },
            update: { signupFeePaid: true, status: 'ativo' }
          }).catch(() => {});
        }
        await prisma.pagamentoRegistro.upsert({
          where: { paymentId: String(data.id) },
          create: { paymentId: String(data.id), tipo: 'coach-adesao', valor, doadorEmail, ref, status: 'aprovado' },
          update: { status: 'aprovado' }
        }).catch(() => {});
        console.log('[WEBHOOK] ✅ Coach adesão paga:', userId);
      }

      // === COACH MENSALIDADE ===
      if (ref.startsWith('coach-mensal-')) {
        const userId = ref.split('-')[2];
        const perfil = await prisma.coachProfile.findUnique({ where: { userId }, include: { atletas: { where: { status: 'ativo' } } } }).catch(() => null);
        if (perfil) {
          await prisma.coachSubscription.upsert({
            where: { coachId: perfil.id },
            create: { coachId: perfil.id, signupFeePaid: true, athleteCount: perfil.atletas?.length || 0, monthlyValue: valor, status: 'ativo' },
            update: { athleteCount: perfil.atletas?.length || 0, monthlyValue: valor, status: 'ativo' }
          }).catch(() => {});
        }
        await prisma.pagamentoRegistro.upsert({
          where: { paymentId: String(data.id) },
          create: { paymentId: String(data.id), tipo: 'coach-mensal', valor, doadorEmail, ref, status: 'aprovado' },
          update: { status: 'aprovado' }
        }).catch(() => {});
        console.log('[WEBHOOK] ✅ Coach mensalidade paga:', userId, 'R$', valor);
      }

      // === PREMIUM (IA TREINADORA) ===
      if (ref.startsWith('premium-')) {
        const userId = ref.split('-')[1];
        const premiumUntil = new Date();
        premiumUntil.setDate(premiumUntil.getDate() + 30);
        await prisma.user.update({
          where: { id: userId },
          data: { isPremium: true, premiumUntil }
        }).catch(() => {});
        await prisma.pagamentoRegistro.upsert({
          where: { paymentId: String(data.id) },
          create: { paymentId: String(data.id), tipo: 'premium', valor, doadorEmail, ref, status: 'aprovado' },
          update: { status: 'aprovado' }
        }).catch(() => {});
        console.log('[WEBHOOK] ✅ Premium ativado:', userId, 'até', premiumUntil.toISOString());
      }


      // === LONGEVIDADE ===
      if (ref.startsWith('longevidade-')) {
        const userId = ref.split('-')[1];
        const premiumUntil = new Date();
        premiumUntil.setDate(premiumUntil.getDate() + 30);
        await prisma.user.update({
          where: { id: userId },
          data: { isPremium: true, premiumUntil }
        }).catch(() => {});
        await prisma.pagamentoRegistro.upsert({
          where: { paymentId: String(data.id) },
          create: { paymentId: String(data.id), tipo: 'longevidade', valor, doadorEmail, ref, status: 'aprovado' },
          update: { status: 'aprovado' }
        }).catch(() => {});
        console.log('[WEBHOOK] ✅ Longevidade ativado:', userId, 'até', premiumUntil.toISOString());
      }

    } catch (e) { console.error('[WEBHOOK ERROR]', e.message); }
  });

  
  // =====================================================
  // PAGAMENTOS DE ASSINATURA — COACH + PREMIUM
  // =====================================================

  // POST /pagamentos/coach/adesao — taxa de adesão R$99,90
  fastify.post('/pagamentos/coach/adesao', async (req, reply) => {
    if (!mpConfigurado()) return reply.code(503).send({ error: 'Pagamentos não configurados.' });
    const jwt = await import('jsonwebtoken');
    const u = (() => { try { return jwt.default.verify(req.headers.authorization?.replace('Bearer ',''), process.env.JWT_SECRET || 'pace-secret-2026'); } catch { return null; } })();
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    try {
      // Verificar se já pagou adesão
      const perfil = await prisma.coachProfile.findUnique({ where: { userId: u.userId }, include: { subscription: true } });
      if (perfil?.subscription?.signupFeePaid) {
        return reply.code(400).send({ error: 'Adesão já foi paga!', signupFeePaid: true });
      }

      const externalRef = `coach-adesao-${u.userId}-${Date.now()}`;
      const paymentApi = new Payment(getMPClient());
      const result = await paymentApi.create({ body: {
        transaction_amount: 99.90,
        description: 'PACE BRAZIL — Adesão Treinador',
        payment_method_id: 'pix',
        external_reference: externalRef,
        notification_url: `${BASE_URL}/pagamentos/webhook`,
        payer: { email: req.body?.email || 'treinador@pacecorridas.com.br' }
      }});

      const pixData = result?.point_of_interaction?.transaction_data;
      if (!pixData?.qr_code) return reply.code(500).send({ error: 'Pix não gerado.' });

      return {
        ok: true,
        tipo: 'coach-adesao',
        valor: 99.90,
        paymentId: result.id,
        qrCode: pixData.qr_code,
        qrCodeBase64: pixData.qr_code_base64,
        externalRef
      };
    } catch (e) {
      console.error('[MP COACH ADESAO]', e.message);
      return reply.code(500).send({ error: e.message });
    }
  });

  // POST /pagamentos/coach/mensalidade — R$3,99 x atletas ativos
  fastify.post('/pagamentos/coach/mensalidade', async (req, reply) => {
    if (!mpConfigurado()) return reply.code(503).send({ error: 'Pagamentos não configurados.' });
    const jwt = await import('jsonwebtoken');
    const u = (() => { try { return jwt.default.verify(req.headers.authorization?.replace('Bearer ',''), process.env.JWT_SECRET || 'pace-secret-2026'); } catch { return null; } })();
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    try {
      const perfil = await prisma.coachProfile.findUnique({
        where: { userId: u.userId },
        include: { atletas: { where: { status: 'ativo' } }, subscription: true }
      });

      if (!perfil) return reply.code(404).send({ error: 'Perfil de treinador não encontrado' });
      if (!perfil.subscription?.signupFeePaid) {
        return reply.code(400).send({ error: 'Pague a taxa de adesão primeiro!', signupFeePaid: false });
      }

      const atletasAtivos = perfil.atletas.length;
      if (atletasAtivos === 0) return reply.code(400).send({ error: 'Nenhum atleta ativo vinculado.' });

      const valor = Math.round(atletasAtivos * 3.99 * 100) / 100;
      const externalRef = `coach-mensal-${u.userId}-${atletasAtivos}a-${Date.now()}`;

      const paymentApi = new Payment(getMPClient());
      const result = await paymentApi.create({ body: {
        transaction_amount: valor,
        description: `PACE — Mensalidade Treinador (${atletasAtivos} atletas)`,
        payment_method_id: 'pix',
        external_reference: externalRef,
        notification_url: `${BASE_URL}/pagamentos/webhook`,
        payer: { email: req.body?.email || 'treinador@pacecorridas.com.br' }
      }});

      const pixData = result?.point_of_interaction?.transaction_data;
      if (!pixData?.qr_code) return reply.code(500).send({ error: 'Pix não gerado.' });

      return {
        ok: true,
        tipo: 'coach-mensalidade',
        atletasAtivos,
        valorPorAtleta: 3.99,
        valorTotal: valor,
        paymentId: result.id,
        qrCode: pixData.qr_code,
        qrCodeBase64: pixData.qr_code_base64,
        externalRef
      };
    } catch (e) {
      console.error('[MP COACH MENSAL]', e.message);
      return reply.code(500).send({ error: e.message });
    }
  });

  // POST /pagamentos/premium — IA Treinadora R$29,90/mês
  fastify.post('/pagamentos/premium', async (req, reply) => {
    if (!mpConfigurado()) return reply.code(503).send({ error: 'Pagamentos não configurados.' });
    const jwt = await import('jsonwebtoken');
    const u = (() => { try { return jwt.default.verify(req.headers.authorization?.replace('Bearer ',''), process.env.JWT_SECRET || 'pace-secret-2026'); } catch { return null; } })();
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    try {
      const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { isPremium: true, premiumUntil: true, email: true, name: true } });
      
      // Verificar se já é premium válido
      if (user?.isPremium && user?.premiumUntil && new Date(user.premiumUntil) > new Date()) {
        const diasRestantes = Math.ceil((new Date(user.premiumUntil) - new Date()) / (1000*60*60*24));
        return reply.code(400).send({ error: `Você já é Premium! Faltam ${diasRestantes} dias.`, isPremium: true, premiumUntil: user.premiumUntil });
      }

      const externalRef = `premium-${u.userId}-${Date.now()}`;
      const paymentApi = new Payment(getMPClient());
      const result = await paymentApi.create({ body: {
        transaction_amount: 29.90,
        description: 'PACE BRAZIL — IA Treinadora Premium (30 dias)',
        payment_method_id: 'pix',
        external_reference: externalRef,
        notification_url: `${BASE_URL}/pagamentos/webhook`,
        payer: {
          email: user?.email || req.body?.email || 'atleta@pacecorridas.com.br',
          first_name: user?.name || 'Atleta'
        }
      }});

      const pixData = result?.point_of_interaction?.transaction_data;
      if (!pixData?.qr_code) return reply.code(500).send({ error: 'Pix não gerado.' });

      return {
        ok: true,
        tipo: 'premium',
        valor: 29.90,
        periodo: '30 dias',
        paymentId: result.id,
        qrCode: pixData.qr_code,
        qrCodeBase64: pixData.qr_code_base64,
        externalRef
      };
    } catch (e) {
      console.error('[MP PREMIUM]', e.message);
      return reply.code(500).send({ error: e.message });
    }
  });


  // POST /pagamentos/longevidade — Protocolo Longevidade R$99,90/mês
  fastify.post('/pagamentos/longevidade', async (req, reply) => {
    if (!mpConfigurado()) return reply.code(503).send({ error: 'Pagamentos não configurados.' });
    const jwt = await import('jsonwebtoken');
    const u = (() => { try { return jwt.default.verify(req.headers.authorization?.replace('Bearer ',''), process.env.JWT_SECRET || 'pace-secret-2026'); } catch { return null; } })();
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    try {
      const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { email: true, name: true } });
      const externalRef = 'longevidade-' + u.userId + '-' + Date.now();
      const paymentApi = new Payment(getMPClient());
      const result = await paymentApi.create({ body: {
        transaction_amount: 99.90,
        description: 'PACE BRAZIL — Protocolo Longevidade + Performance (30 dias)',
        payment_method_id: 'pix',
        external_reference: externalRef,
        notification_url: BASE_URL + '/pagamentos/webhook',
        payer: { email: user?.email || 'atleta@pacebrazil.com', first_name: user?.name || 'Atleta' }
      }});

      const pixData = result?.point_of_interaction?.transaction_data;
      if (!pixData?.qr_code) return reply.code(500).send({ error: 'Pix não gerado.' });

      return {
        ok: true,
        tipo: 'longevidade',
        valor: 99.90,
        periodo: '30 dias',
        paymentId: result.id,
        qrCode: pixData.qr_code,
        qrCodeBase64: pixData.qr_code_base64,
        externalRef
      };
    } catch (e) {
      console.error('[MP LONGEVIDADE]', e.message);
      return reply.code(500).send({ error: e.message });
    }
  });

  fastify.get('/pagamentos/status', async (req, reply) => {
    const token = process.env.MP_ACCESS_TOKEN || '';
    return {
      configurado: !!token,
      modo: token.startsWith('APP_USR') ? 'producao' : token.includes('TEST') ? 'sandbox' : 'nao_configurado',
      linkDoacaoX1: 'https://link.mercadopago.com.br/rnestampace'
    };
  });

  fastify.get('/pagamentos/admin/lista', async (req, reply) => {
    if (req.headers['x-admin-key'] !== (process.env.ADMIN_KEY || 'pace-admin-2026')) return reply.code(403).send({ error: 'Sem permissão' });
    const pagamentos = await prisma.pagamentoRegistro.findMany({ orderBy: { criadoEm: 'desc' }, take: 100 }).catch(() => []);
    return pagamentos;
  });
}
