import cron from 'node-cron';
import { scraperService } from '../modules/scraper/scraper.service.js';

// Rodar todos os dias às 6h da manhã
cron.schedule('0 6 * * *', async () => {
  console.log('⏰ Executando scraper automático...');
  const result = await scraperService.scrapeAllSites();
  console.log(`✅ Scraper completo: ${result.total} corridas`);
});

console.log('🤖 Cronjob iniciado - Scraper roda diariamente às 6h');
