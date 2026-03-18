import prisma from "../../lib/prisma.js";
export default async function agegroupRoutes(fastify) {
  fastify.put('/races/:id/agegroups', async (req, reply) => { const { id } = req.params; try { const race = await prisma.race.update({ where: { id }, data: { ageGroupType: req.body?.ageGroupType || 'none' } }); return { success: true, race }; } catch(e) { return reply.code(500).send({ error: e.message }); } });
  fastify.get('/races/:id/agegroups', async (req, reply) => { const race = await prisma.race.findUnique({ where: { id: req.params.id } }); if (!race) return reply.code(404).send({ error: 'Não encontrada' }); const tipo = race.ageGroupType||'none'; const g = tipo==='5'?['Geral','15-19','20-24','25-29','30-34','35-39','40-44','45-49','50-54','55-59','60-64','65+']:tipo==='10'?['Geral','Sub-20','20-29','30-39','40-49','50-59','60-69','70+']:[]; return { raceId: race.id, raceName: race.name, ageGroupType: tipo, ageGroups: g }; });
}
