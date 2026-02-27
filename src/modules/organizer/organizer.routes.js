import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function organizerRoutes(fastify) {

  fastify.post('/organizer/submit', async (req, reply) => {
    try {
      const { name, email, phone, eventName, eventCity, eventState, eventDate, distances, registrationUrl, plan } = req.body;
      if(!name||!email||!eventName||!eventCity||!eventState) {
        return reply.code(400).send({ error: 'Campos obrigatórios: nome, email, evento, cidade, estado' });
      }
      const r = await prisma.organizerRequest.create({
        data: { name, email, phone:phone||null, eventName, eventCity, eventState, eventDate:eventDate||'A definir', distances:distances||'A definir', registrationUrl:registrationUrl||null, status: plan==='premium'?'pending_payment':'pending' }
      });
      if(plan !== 'premium') {
        await prisma.race.create({
          data: { name: eventName, city: eventCity, state: eventState.toUpperCase(), date: eventDate ? new Date(eventDate) : new Date(Date.now()+90*24*60*60*1000), distances: distances||'A definir', organizer: name, status:'upcoming', registrationUrl: registrationUrl||null }
        });
      }
      return { success: true, id: r.id, message: plan==='premium' ? 'Solicitação recebida! Entraremos em contato.' : 'Corrida cadastrada com sucesso!' };
    } catch(e) {
      return reply.code(500).send({ error: e.message });
    }
  });

  fastify.get('/organizer/requests', async (req, reply) => {
    const key = req.headers['x-api-key'];
    if(key !== process.env.ADMIN_API_KEY) return reply.code(401).send({ error: 'Não autorizado' });
    return prisma.organizerRequest.findMany({ orderBy: { createdAt: 'desc' } });
  });

  fastify.post('/organizer/approve/:id', async (req, reply) => {
    const key = req.headers['x-api-key'];
    if(key !== process.env.ADMIN_API_KEY) return reply.code(401).send({ error: 'Não autorizado' });
    const r = await prisma.organizerRequest.findUnique({ where: { id: req.params.id } });
    if(!r) return reply.code(404).send({ error: 'Não encontrado' });
    await prisma.race.create({
      data: { name: r.eventName, city: r.eventCity, state: r.eventState, date: new Date(r.eventDate||Date.now()+90*24*60*60*1000), distances: r.distances, organizer: r.name, status:'upcoming', registrationUrl: r.registrationUrl||null }
    });
    await prisma.organizerRequest.update({ where: { id: r.id }, data: { status: 'approved' } });
    return { success: true };
  });
}
