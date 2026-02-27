import Fastify from 'fastify';
import cors from '@fastify/cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { raceRoutes } from './modules/races/races.routes.js';
import { resultsRoutes } from './modules/results/results.routes.js';
import { rankingRoutes } from './modules/ranking/ranking.routes.js';
import { scraperRoutes } from './modules/scraper/scraper.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { organizerRoutes } from './modules/organizer/organizer.routes.js';
import { matchRoutes } from './modules/match/match.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { uploadRoutes } from './modules/upload/upload.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
const app = Fastify({ logger: false });
await app.register(cors, { origin: '*' });



const pages = ['calculadoras','usuario','index','entrar','perfil','pacematch','calendario','importar-resultado','organizador','resultados','stats','social','faixas'];
for(const pg of pages) {
  const route = pg==='index' ? '/' : `/${pg}.html`;
  const file = pg==='index' ? 'index.html' : `${pg}.html`;
  app.get(route, async(req,reply)=>{ try{ reply.type('text/html').send(fs.readFileSync(path.join(__dirname,'../public',file),'utf-8')); }catch{ reply.code(404).send('Not found'); }});
}
app.get('/manifest.json',async(req,reply)=>{ try{ reply.type('application/json').send(fs.readFileSync(path.join(__dirname,'../public/manifest.json'),'utf-8')); }catch{ reply.send('{}'); }});
app.get('/sw.js',async(req,reply)=>{ try{ reply.type('application/javascript').send(fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf-8')); }catch{ reply.send(''); }});

await app.register(raceRoutes);
await app.register(resultsRoutes);
await app.register(rankingRoutes);
await app.register(scraperRoutes);
await app.register(authRoutes);
await app.register(organizerRoutes);
await app.register(matchRoutes);
await app.register(analyticsRoutes);
await app.register(uploadRoutes);


setTimeout(async()=>{
  try{ const{runScraperJob}=await import('./jobs/scraperJob.js'); runScraperJob(); setInterval(()=>runScraperJob(),4*60*60*1000); }
  catch(e){console.error('[CRON]',e.message);}
},60000);

app.listen({port:process.env.PORT||3000,host:'0.0.0.0'},(err)=>{
  if(err){console.error(err);process.exit(1);}
  console.log('✅ PACE online');
});
