import { MercadoPagoConfig, Preference } from 'mercadopago';

export default async function paymentsRoutes(app, opts) {

  console.log('💰 paymentsRoutes carregado');

  const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN,
  });

  app.post('/create-payment', async (req, reply) => {
    console.log('🔥 ROTA PAYMENT CHAMADA');

    try {
      const preference = new Preference(client);

      const result = await preference.create({
        body: {
          items: [
            {
              title: 'PACE PRO',
              quantity: 1,
              currency_id: 'BRL',
              unit_price: 9.9
            }
          ],
          external_reference: "1",
          back_urls: {
            success: 'http://localhost:3000/sucesso',
            failure: 'http://localhost:3000/erro',
            pending: 'http://localhost:3000/pendente'
          }
        }
      });

      return { url: result.init_point };

    } catch (error) {
      console.error('❌ Erro Mercado Pago:', error);
      reply.code(500);
      return { error: 'Erro ao criar pagamento' };
    }
  });

}
