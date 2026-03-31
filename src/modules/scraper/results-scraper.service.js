import puppeteer from 'puppeteer-core';

export async function scrapeResultados(raceUrl, raceId) {
  let browser;
  try {
    // Connect to existing Chromium
    browser = await puppeteer.launch({headless:'new',executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--disable-gpu']});

    const page = await browser.newPage();
    await page.goto(raceUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for page to fully load (Next.js SPA)
    await new Promise(r => setTimeout(r, 2000));

    // Debug: Check HTML structure
    const pageContent = await page.evaluate(() => {
      // Look for any element that might contain results
      const selectors = [
        'table tbody tr',
        '[data-testid="results-row"]',
        '.resultado-row',
        'tr[data-*]',
        'div[class*="result"]',
        'div[class*="atleta"]'
      ];
      
      const results = {};
      selectors.forEach(sel => {
        try {
          results[sel] = document.querySelectorAll(sel).length;
        } catch(e) {}
      });
      
      return results;
    });

    // Extract results from table rows - TRY HARDER
    const resultados = await page.evaluate(() => {
      const rows = [];
      
      // More aggressive selectors
      let tableRows = document.querySelectorAll('table tbody tr');
      if (!tableRows.length) tableRows = document.querySelectorAll('tr');
      if (!tableRows.length) tableRows = document.querySelectorAll('[role="row"]');
      if (!tableRows.length) {
        // Try div-based layouts
        tableRows = document.querySelectorAll('[class*="resultado"], [class*="atleta"], [class*="result"]');
      }
      
      tableRows.forEach((row, idx) => {
        try {
          const texto = row.innerText || row.textContent;
          if (!texto || texto.length < 5) return;
          
          // Split by any whitespace/tabs/newlines
          const partes = texto.split(/[\t\n\r|]+/).map(s => s.trim()).filter(Boolean);
          
          if (partes.length < 2) return; // Need at least 2 fields
          
          rows.push({
            posicao: parseInt(partes[0]) || (idx + 1),
            nome: partes[1] || partes[0] || '',
            tempo: partes[2] || '',
            genero: partes[3]?.charAt(0)?.toUpperCase() || 'M',
            faixa: partes[4] || '',
            equipe: partes[5] || '',
            rawText: texto.substring(0, 100)
          });
        } catch(e) {
          // silent
        }
      });
      
      return rows;
    });

    if (!resultados.length) {
      return { success: false, error: 'Nenhum resultado encontrado na tabela', url: raceUrl };
    }

    return {
      success: true,
      raceId,
      url: raceUrl,
      totalResultados: resultados.length,
      resultados: resultados.slice(0, 100), // Limit to 100
      timestamp: new Date().toISOString()
    };

  } catch (erro) {
    return {
      success: false,
      error: erro.message,
      url: raceUrl,
      stack: erro.stack.split('\n').slice(0, 3).join('\n')
    };
  } finally {
    if (browser) await browser.close();
  }
}

// Test function
export async function testarScraper() {
  const url = 'https://resultados.runking.com.br/Speed/41-corrida-cidade-de-aracaju?modality=24KM';
  console.log('🕷️  Iniciando scraper:', url);
  
  const resultado = await scrapeResultados(url, 'test-race-id');
  
  if (resultado.success) {
    console.log(`✅ ${resultado.totalResultados} resultados encontrados`);
    console.log('Amostra:', resultado.resultados.slice(0, 3));
  } else {
    console.error('❌ Erro:', resultado.error);
  }
  
  return resultado;
}
