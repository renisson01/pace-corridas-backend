import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

export default async function webhookRoutes(app, opts) {

  app.post('/webhook', async (req, reply) => {

    const body = req.body;

    console.log('🔔 WEBHOOK RECEBIDO:', body);

    if (body.type === 'payment') {

      const paymentId = body.data.id;

      try {

        // 🔥 CONSULTA REAL NO MERCADO PAGO
        const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
          }
        });

        const payment = await response.json();

        console.log('📦 DADOS PAGAMENTO:', payment.status);

        if (payment.status === 'approved') {

          const userId = payment.external_reference;

          // 💾 SALVAR PAGAMENTO
          await prisma.payment.upsert({
            where: { externalId: String(paymentId) },
            update: { status: 'paid' },
            create: {
              externalId: String(paymentId),
              status: 'paid',
              amount: payment.transaction_amount || 9.9
            }
          });

          // 🔓 LIBERAR PRO
          await prisma.user.update({
            where: { id: userId },
            data: {
              isPro: true
            }
          });

          console.log('💰 PAGAMENTO CONFIRMADO REAL:', paymentId);

        }

      } catch (e) {
        console.error('❌ ERRO WEBHOOK:', e);
      }
    }

    return { ok: true };
  });

}
