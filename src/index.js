import Fastify from 'fastify';
import cors from '@fastify/cors';
import { racesRoutes } from './modules/races/races.routes.js';
import { resultsRoutes } from './modules/results/results.routes.js';
import { scraperRoutes } from './modules/scraper/scraper.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import scraperBrasilRoutes from './modules/agegroups/scraper-brasil.routes.js';
import agegroupRoutes from './modules/agegroups/agegroups.routes.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({ logger: true });

// REGISTRAR TUDO ANTES DO LISTEN!
app.register(cors, { origin: '*' });
app.register(racesRoutes);
app.register(resultsRoutes);
app.register(scraperRoutes);
app.register(analyticsRoutes);
app.register(agegroupRoutes);
app.register(scraperBrasilRoutes);

// Rotas HTML
app.get('/', async (request, reply) => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
  reply.type('text/html').send(html);
});

app.get('/faixas.html', async (request, reply) => {
  const html = fs.readFileSync(path.join(__dirname, '../public/faixas.html'), 'utf-8');
  reply.type('text/html').send(html);
});

app.get('/resultados.html', async(req,reply)=>{const html=fs.readFileSync(path.join(__dirname,'../public/resultados.html'),'utf-8');reply.type('text/html').send(html);});
app.get('/stats.html', async (request, reply) => {
  const html = fs.readFileSync(path.join(__dirname, '../public/stats.html'), 'utf-8');
  reply.type('text/html').send(html);
});

// LISTEN POR ÚLTIMO!
const PORT = process.env.PORT || 3000;
app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  console.log(`🚀 PACE rodando na porta ${PORT}`);
});
