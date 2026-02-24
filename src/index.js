import Fastify from 'fastify';
import cors from '@fastify/cors';
import { racesRoutes } from './modules/races/races.routes.js';
import { resultsRoutes } from './modules/results/results.routes.js';
import { scraperRoutes } from './modules/scraper/scraper.routes.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({ logger: true });

await app.register(cors, { origin: '*' });
await app.register(racesRoutes);
await app.register(resultsRoutes);
await app.register(scraperRoutes);

app.get('/', async (request, reply) => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
  reply.type('text/html').send(html);
});

app.get('/index.html', async (request, reply) => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
  reply.type('text/html').send(html);
});

const PORT = process.env.PORT || 3000;
await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`🚀 Servidor rodando na porta ${PORT}`);
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
await app.register(analyticsRoutes);
