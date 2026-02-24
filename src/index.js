import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { racesRoutes } from './modules/races/races.routes.js';
import { resultsRoutes } from './modules/results/results.routes.js';
import { uploadRoutes } from './modules/upload/upload.routes.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({ logger: true });

await app.register(cors, { origin: '*' });
await app.register(multipart);

await app.register(racesRoutes);
await app.register(resultsRoutes);
await app.register(uploadRoutes);

app.get('/', async (request, reply) => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
  reply.type('text/html').send(html);
});

app.get('/index.html', async (request, reply) => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
  reply.type('text/html').send(html);
});

const PORT = 3000;
await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`🚀 Servidor: http://localhost:${PORT}`);
console.log(`📤 Upload de PDF ativado!`);
