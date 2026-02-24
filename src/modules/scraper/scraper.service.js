import { prisma } from '../../utils/prisma.js';

export const scraperService = {
  async scrapeAllSites() {
    console.log('🔍 Scraper executado');
    return { total: 0, sites: 0, message: 'Scraper em desenvolvimento' };
  }
};
