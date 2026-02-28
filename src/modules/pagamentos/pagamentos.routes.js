import { MercadoPagoConfig, Preference } from 'mercadopago';

const client = new MercadoPagoConfig({ 
  accessToken: process.env.MP_ACCESS_TOKEN || '',
});

const BASE_URL = process.env.BASE_URL || 'https://web-production-990e7.up.railway.app';

export async function pagamentosRoutes(fastify) {

  // POST /pagamentos/loja — gera link de pagamento para produto da loja
  fastify.post('/pagamentos/loja', async (req, reply) => {
    try {
      const { produtoId, tamanho, cor, quantidade = 1, compradorNome, compradorEmail } = req.body || {};
      if (!produtoId) return reply.code(400).send({ error: 'produtoId obrigatório' });

      // Buscar produto
      const produto = await req.server.prisma?.produto?.findUnique({ where: { id: produtoId } })
        .catch(() => null);

      // Fallback se prisma não estiver no server
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const p = produto || await prisma.produto.findUnique({ where: { id: produtoId } });
      await prisma.$disconnect();

      if (!p) return reply.code(404).send({ error: 'Produto não encontrado' });

      const preference = new Preference(client);
      const result = await preference.create({
        body: {
          items: [{
            id: p.id,
            title: `${p.nome}${tamanho ? ' — Tam. '+tamanho : ''}${cor ? ' / '+cor : ''}`,
            description: p.descricao || 'Camisa PACE',
            quantity: quantidade,
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
      return reply.code(500).send({ error: e.message });
    }
  });

  // POST /pagamentos/doacao-x1 — gera link de doação para o X1
  fastify.post('/pagamentos/doacao-x1', async (req, reply) => {
    try {
      const { valor, atletaApoio, doadorNome, doadorEmail } = req.body || {};
      if (!valor || valor < 5) return reply.code(400).send({ error: 'Valor mínimo R$ 5,00' });

      const TAXA = 0.50; // 50% taxa de serviço da plataforma
      const valorTotal = parseFloat(valor);
      const valorAtleta = valorTotal * (1 - TAXA);

      const preference = new Preference(client);
      const result = await preference.create({
        body: {
          items: [{
            id: `doacao-x1-${Date.now()}`,
            title: `Apoio X1 — ${atletaApoio === 'pedro' ? 'Pedrinho 19km' : 'Tiago Portões 17km'}`,
            description: `Doação ao vencedor. Taxa de serviço PACE: 50%. Valor ao atleta: R$ ${valorAtleta.toFixed(2)}`,
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
            installments: 1, // doação não parcela
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
        taxaPlataforma: parseFloat((valorTotal * TAXA).toFixed(2)),
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
      // Aqui futuramente: registrar pagamento confirmado no banco
      return reply.code(200).send({ ok: true });
    } catch(e) {
      return reply.code(200).send({ ok: true }); // sempre 200 para MP
    }
  });

  // GET /pagamentos/status — verificar se MP está configurado
  fastify.get('/pagamentos/status', async (req, reply) => {
    return {
      configurado: !!process.env.MP_ACCESS_TOKEN,
      modo: process.env.MP_ACCESS_TOKEN?.includes('TEST') ? 'sandbox' : 'producao',
      linkDoacao: 'https://link.mercadopago.com.br/rnestampace',
    };
  });
}
