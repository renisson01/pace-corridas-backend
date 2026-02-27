export async function runScraperJob() {
  console.log('[SCRAPER] Job executado:', new Date().toLocaleString('pt-BR'));
  return { novas: 0, skip: 0 };
}
