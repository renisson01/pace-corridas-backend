module.exports = {
  baseUrl: 'https://web-production-990e7.up.railway.app',
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  timeout: 15000,
  screenshotsDir: '/tmp/regeni-qa/screenshots',
  cerebroDir: process.env.HOME + '/pace-corridas-backend/cerebro/agentes/qa',

  pages: [
    {
      id: 'home',
      path: '/',
      name: 'Início',
      checks: [
        { type: 'text-exists', selector: 'body', text: 'REGENI' },
        { type: 'element-visible', selector: 'nav' },
        { type: 'text-exists', selector: 'body', text: 'Buscar' },
        { type: 'no-console-errors' },
      ]
    },
    {
      id: 'resultados',
      path: '/resultados.html',
      name: 'Resultados',
      checks: [
        { type: 'text-exists', selector: 'body', text: 'Ranking' },
        { type: 'element-visible', selector: 'nav' },
        { type: 'api-responds', url: '/ranking/10km?limit=5', expectStatus: 200 },
        { type: 'no-console-errors' },
      ]
    },
    {
      id: 'atleta',
      path: '/atleta.html',
      name: 'Atleta',
      checks: [
        { type: 'element-visible', selector: 'nav' },
        { type: 'no-console-errors' },
      ]
    },
    {
      id: 'corridas',
      path: '/corridas-abertas.html',
      name: 'Corridas',
      checks: [
        { type: 'text-exists', selector: 'body', text: 'Corridas Abertas' },
        { type: 'element-visible', selector: 'nav' },
        { type: 'element-count-min', selector: '.corrida-card', min: 1 },
        { type: 'no-console-errors' },
      ]
    }
  ],

  apiChecks: [
    { method: 'GET', path: '/ranking/10km?limit=3', expectStatus: 200, expectJson: true },
    { method: 'GET', path: '/ranking/5km?limit=3', expectStatus: 200, expectJson: true },
    { method: 'GET', path: '/buscar-atletas?q=RENISSON&limit=3', expectStatus: 200, expectJson: true },
    { method: 'GET', path: '/corridas-abertas', expectStatus: 200, expectJson: true },
  ],

  performanceThresholds: {
    maxLoadTimeMs: 3000,
    maxApiTimeMs: 2000,
  }
};
