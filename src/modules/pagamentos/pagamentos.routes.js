import { MercadoPagoConfig, Preference } from 'mercadopago';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;

// ✅ FIX: Prisma instanciado uma única vez no módulo, não dentro de cada requisição
const prisma = new PrismaClient();

// ✅ FIX: Verificar se token existe antes de inicializar o cliente MP
const MP_TOKEN = process.env.MP_ACCESS_TOKEN || '';
if (!MP_TOKEN) {
  console.warn('[MP] AVISO: MP_ACCESS_TOKEN não configurado! Pagamentos estarão desativados.');
}

const client = new MercadoPagoConfig({ 
  accessToken: MP_TOKEN,
});

const BASE_URL = process.env.BASE_URL || 'https://web-production-990e7.up.railway.app';

// ✅ FIX: Taxa documentada corretamente
const TAXA_PLATAFORMA = 0.15; // 15% de taxa de serviço da plataforma

export async function pagamentosRoutes(fastify) {

  // POST /pagamentos/loja — gera link de pagamento para produto da loja
  fastify.post('/pagamentos/loja', async (req, reply) => {
    // ✅ FIX: Bloquear se MP não estiver configurado
    if (!MP_TOKEN) {
      return reply.code(503).send({ error: 'Sistema de pagamentos não configurado.' });
    }

    try {
      const { produtoId, tamanho, cor, quantidade = 1, compradorNome, compradorEmail } = req.body || {};
      if (!produtoId) return reply.code(400).send({ error: 'produtoId obrigatório' });

      // ✅ FIX: Usando a instância única do Prisma (sem criar/desconectar a cada req)
      const p = await prisma.produto.findUnique({ where: { id: produtoId } }).catch(() => null);
      if (!p) return reply.code(404).send({ error: 'Produto não encontrado' });

      const preference = new Preference(client);
      const result = await preference.create({
        body: {
          items: [{
            id: p.id,
            title: `${p.nome}${tamanho ? ' — Tam. '+tamanho : ''}${cor ? ' / '+cor : ''}`,
            description: p.descricao || 'Camisa PACE',
            quantity: parseInt(quantidade),
            unit_price: parseFloat(p.preco),
            currency_id: 'BRL',
            category_id: 'fashion',
          }],
          payer: {
            name: compradorNome || '',
            email: compradorEmail || '',
          },
          payment_methods: {
            excluded_payment_types: [],
            installments: 12,
          },
          back_urls: {
            success: `${BASE_URL}/loja.html?pagamento=sucesso`,
            failure: `${BASE_URL}/loja.html?pagamento=erro`,
            pending: `${BASE_URL}/loja.html?pagamento=pendente`,
          },
          auto_return: 'approved',
          statement_descriptor: 'PACE CORRIDAS',
          external_reference: `loja-${produtoId}-${Date.now()}`,
          notification_url: `${BASE_URL}/pagamentos/webhook`,
        }
      });

      return { 
        url: result.init_point,
        preferenceId: result.id,
        produto: p.nome,
        valor: p.preco
      };
    } catch(e) {
      console.error('[MP LOJA]', e.message);
      // ✅ FIX: Mensagem de erro mais amigável
      return reply.code(500).send({ error: 'Erro ao gerar link de pagamento. Tente novamente.' });
    }
  });

  // POST /pagamentos/doacao-x1 — gera link de doação para o X1
  fastify.post('/pagamentos/doacao-x1', async (req, reply) => {
    if (!MP_TOKEN) {
      return reply.code(503).send({ error: 'Sistema de pagamentos não configurado.' });
    }

    try {
      const { valor, atletaApoio, doadorNome, doadorEmail } = req.body || {};
      if (!valor || valor < 5) return reply.code(400).send({ error: 'Valor mínimo R$ 5,00' });

      const valorTotal = parseFloat(valor);
      const valorAtleta = valorTotal * (1 - TAXA_PLATAFORMA); // ✅ FIX: Taxa correta (15%)

      const preference = new Preference(client);
      const result = await preference.create({
        body: {
          items: [{
            id: `doacao-x1-${Date.now()}`,
            title: `Apoio X1 — ${atletaApoio === 'pedro' ? 'Pedrinho 19km' : 'Tiago Portões 17km'}`,
            description: `Doação ao vencedor. Taxa de serviço PACE: ${TAXA_PLATAFORMA * 100}%. Valor ao atleta: R$ ${valorAtleta.toFixed(2)}`,
            quantity: 1,
            unit_price: valorTotal,
            currency_id: 'BRL',
            category_id: 'services',
          }],
          payer: {
            name: doadorNome || 'Torcedor',
            email: doadorEmail || '',
          },
          payment_methods: {
            installments: 1,
          },
          back_urls: {
            success: `${BASE_URL}/x1.html?doacao=sucesso&atleta=${atletaApoio}&valor=${valorTotal}`,
            failure: `${BASE_URL}/x1.html?doacao=erro`,
            pending: `${BASE_URL}/x1.html?doacao=pendente`,
          },
          auto_return: 'approved',
          statement_descriptor: 'PACE X1',
          external_reference: `x1-${atletaApoio}-${Date.now()}`,
          notification_url: `${BASE_URL}/pagamentos/webhook`,
        }
      });

      return {
        url: result.init_point,
        preferenceId: result.id,
        valorTotal,
        valorAtleta: parseFloat(valorAtleta.toFixed(2)),
        taxaPlataforma: parseFloat((valorTotal * TAXA_PLATAFORMA).toFixed(2)),
        atleta: atletaApoio
      };
    } catch(e) {
      console.error('[MP DOACAO]', e.message);
      return reply.code(500).send({ error: e.message });
    }
  });

  // POST /pagamentos/webhook — recebe notificações do MP
  fastify.post('/pagamentos/webhook', async (req, reply) => {
    try {
      const { type, data } = req.body || {};
      console.log('[MP WEBHOOK]', type, data?.id);

      // ✅ FIX: Processar pagamento aprovado (básico)
      if (type === 'payment' && data?.id) {
        console.log('[MP WEBHOOK] Pagamento recebido, ID:', data.id);
        // TODO: buscar detalhes do pagamento via API do MP e registrar no banco
        // Exemplo futuro:
        // const payment = await new Payment(client).get({ id: data.id });
        // if (payment.status === 'approved') { ... registrar no banco ... }
      }

      return reply.code(200).send({ ok: true });
    } catch(e) {
      return reply.code(200).send({ ok: true }); // sempre 200 para MP
    }
  });

  // GET /pagamentos/status — verificar se MP está configurado
  fastify.get('/pagamentos/status', async (req, reply) => {
    return {
      configurado: !!MP_TOKEN,
      modo: MP_TOKEN?.includes('TEST') ? 'sandbox' : 'producao',
      linkDoacao: 'https://link.mercadopago.com.br/rnestampace',
    };
  });
}
