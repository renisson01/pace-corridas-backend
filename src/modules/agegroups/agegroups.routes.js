import prisma from '../../utils/prisma.js';

export default async function agegroupRoutes(fastify) {
  fastify.put('/races/:id/agegroups', async (req, reply) => {
    const { id } = req.params;
    const { ageGroupType } = req.body;
    const race = await prisma.race.update({ where: { id }, data: { ageGroupType: ageGroupType || 'none' } });
    return { success: true, race };
  });
}
