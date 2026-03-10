import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const prisma = new PrismaClient();
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
    } catch (e) { console.error('[WEBHOOK ERROR]', e.message); }
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
