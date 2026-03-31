import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, '../../public/uploads/tests');

// Ensure directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const TESTS = [
  { page: 'home', element: 'score', selector: '#scoreNumber', name: 'Score visível' },
  { page: 'home', element: 'ranking', selector: '#rankingMini', name: 'Ranking renderizado' },
  { page: 'home', element: 'meta', selector: '[class*="missao"]', name: 'Meta 15min aparece' },
  { page: 'corridas', element: 'lista', selector: '#corridasList', name: 'Lista carregada' },
  { page: 'corridas', element: 'filtros', selector: '#chipsEstado', name: 'Filtros visíveis' },
  { page: 'ia', element: 'input', selector: '#iaInputFull', name: 'Chat input existe' },
  { page: 'ia', element: 'chips', selector: '[class*="chip"]', name: 'Chips visíveis' },
  { page: 'cobaia', element: 'tabs', selector: '[class*="tab"]', name: 'Tabs funcionam' },
  { page: 'cobaia', element: 'piramide', selector: '[class*="piramide"]', name: 'Pirâmide aparece' },
  { page: 'perfil', element: 'nome', selector: '#profileName', name: 'Nome aparece' },
  { page: 'perfil', element: 'btn-resultado', selector: '[onclick*="enviar"], [class*="resultado"]', name: 'Botão resultado existe' },
  { page: 'resultados', element: 'tabela', selector: 'table, [class*="resultado"]', name: 'Tabela renderiza' },
  { page: 'resultados', element: 'sem-undefined', selector: '#status div', name: 'Sem valores undefined' }
];

async function testUI() {
  let browser;
  const report = {
    timestamp: new Date().toISOString(),
    user: 'renisson@proton.me',
    tests: [],
    summary: { ok: 0, fail: 0 }
  };

  try {
    browser = await puppeteer.launch({headless:'new',executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--disable-gpu']});

    const page = await browser.newPage();
    page.setViewport({ width: 1280, height: 720 });

    // 1. LOGIN
    console.log('🔐 Fazendo login...');
    await page.goto('https://web-production-990e7.up.railway.app/entrar.html', { waitUntil: 'networkidle2' });
    
    // Type email
    const emailInput = await page.$('input[type="email"]');
    if (emailInput) await emailInput.type('renisson@proton.me');
    
    // Type password
    const pwdInput = await page.$('input[type="password"]');
    if (pwdInput) await pwdInput.type('Pace@2026!');
    
    // Click login
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
    
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
    } catch(e) {
      console.log('⏳ Timeout de navegação, continuando...');
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('✅ Login feito');

    // 2. TESTAR CADA PÁGINA
    for (const test of TESTS) {
      try {
        const pageUrl = `https://web-production-990e7.up.railway.app/${test.page}.html`;
        
        // Se não está na página, navega
        if (!page.url().includes(test.page)) {
          await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 10000 });
          await new Promise(r => setTimeout(r, 1000)); // Extra time for SPA
        }

        // Verifica elemento
        const exists = await page.$(test.selector) !== null;
        const elementContent = exists ? await page.$eval(test.selector, el => el.textContent) : null;
        
        // Check for "undefined" text
        const hasUndefined = elementContent && elementContent.includes('undefined');

        if (exists && !hasUndefined) {
          report.tests.push({
            status: '✅',
            page: test.page,
            element: test.element,
            name: test.name
          });
          report.summary.ok++;
          console.log(`✅ ${test.page}/${test.element} — OK`);
        } else {
          // Screenshot falha
          const screenshotPath = path.join(SCREENSHOTS_DIR, `fail-${test.page}-${test.element}-${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath });

          report.tests.push({
            status: '❌',
            page: test.page,
            element: test.element,
            name: test.name,
            error: hasUndefined ? 'undefined encontrado' : 'elemento não existe',
            screenshot: path.basename(screenshotPath)
          });
          report.summary.fail++;
          console.log(`❌ ${test.page}/${test.element} — FALHA`);
        }
      } catch(e) {
        const screenshotPath = path.join(SCREENSHOTS_DIR, `error-${test.page}-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath }).catch(() => null);

        report.tests.push({
          status: '❌',
          page: test.page,
          element: test.element,
          name: test.name,
          error: e.message,
          screenshot: path.basename(screenshotPath)
        });
        report.summary.fail++;
        console.error(`❌ ${test.page}/${test.element} — ERRO:`, e.message);
      }
    }

    // 3. SALVAR RELATÓRIO
    const reportPath = path.join(SCREENSHOTS_DIR, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📊 Relatório salvo: ${reportPath}`);
    console.log(`\n✅ ${report.summary.ok} testes passaram`);
    console.log(`❌ ${report.summary.fail} testes falharam`);

    return report;

  } catch(erro) {
    console.error('❌ Erro fatal:', erro.message);
    return { error: erro.message, timestamp: new Date().toISOString() };
  } finally {
    if (browser) await browser.close();
  }
}

// Se rodado direto
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  testUI().then(() => process.exit(0)).catch(() => process.exit(1));
}

export { testUI };
