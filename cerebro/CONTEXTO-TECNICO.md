---
type: referencia
tags: [stack, scrapers, decisoes, contexto]
updated: 2026-04-13
---

# REGENI — Contexto Técnico Completo

> Leia este arquivo antes de começar qualquer sessão de trabalho no REGENI.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js (ESM modules — `import`/`export`) |
| Framework HTTP | **Fastify** (não Express, apesar do Express estar no package.json) |
| ORM | **Prisma** + PostgreSQL |
| Deploy | **Railway** — PostgreSQL managed |
| Auth | JWT (30d) via `jsonwebtoken` + legacy base64url em rotas antigas |
| IA | Claude API (Anthropic) via `ANTHROPIC_API_KEY` |
| Pagamentos | MercadoPago via `MP_ACCESS_TOKEN` |
| Cron | `node-cron` (12 agentes em `src/agents/index.js`) |
| Scraping | **Puppeteer** (instalado), Cheerio, fetch nativo |
| Banco local | Docker Compose (`docker compose up -d`) |

**Importante:**
- `src/` usa ESM (`import`/`export`)
- `scripts/` usa **CommonJS** (`.cjs`) — rodar direto com `node`
- Prisma singleton em `src/lib/prisma.js` — nunca criar novo PrismaClient fora de scripts

---

## Banco de Dados (estado atual: 2026-04-13)

| Tabela | Registros |
|--------|----------|
| Race | ~1.490 corridas |
| Athlete | ~939.000 atletas |
| Result | ~610.000 resultados |

**Campo adicionado recentemente:**
- `Athlete.birthDate` — data de nascimento (adicionado em abril/2026)
- `Athlete.age` — calculado no scraper (pode ser NULL)

---

## Scrapers — Estado Atual

### Funcionando (automático via coleta-semanal.cjs)

| Fonte | Script | Região | Método |
|-------|--------|--------|--------|
| Central de Resultados | `scraper-central-v3.cjs` | Nordeste | API REST (POST form) |
| Runking/Chronomax | `scraper-runking.cjs` | Nacional (SP/RJ/SE/CE) | RSC discovery + AES decrypt |

### Funcionando (manual)

| Fonte | Script | Região | Método |
|-------|--------|--------|--------|
| CronusTec | `scraper-cronustec.cjs` | Bahia | XML CLAX + lista manual |
| SportsChrono | `scraper-sportschrono.cjs` | Sergipe | XML CLAX |
| Contime | `importar-contime.cjs` | Via Central | API Central |
| Race83/CLAX | `race83-scraper-api.cjs` | Nacional | API JSON |
| RunnerBrasil | `scraper-corridas-brasil.cjs` | Nacional | HTML + APIs |

### Pendentes — usar Puppeteer

| Fonte | Script | Região | Situação |
|-------|--------|--------|---------|
| **ChipTiming** | `scraper-chiptiming-puppeteer.cjs` | SP, CE, nacional | API 403 sem auth → **Puppeteer** intercepta cookies + JSON. Página: `eventos.chiptiming.com.br`. API base: `admin.chiptiming.com.br/api/v2`. |
| **Yescom** | `scraper-yescom.cjs` (stub) | SP, RS, CE | Sistema fechado (ASP.NET + login). Investigar se usa ChipTiming como backend. |

### Runking — Organizadores cobertos automaticamente

O `scraper-runking.cjs` descobre **todos** os organizadores na plataforma:
Chronomax (SP/RJ), Speed SE, Norte MKT / O2Corre, Maratona do Rio, Vega Sports, Run Sports, Ponto Org, Letape Brasil, De Castilho RJ, e outros.

---

## Puppeteer — Guia de Uso

**Já instalado:** `puppeteer` + `puppeteer-core` no package.json.

### Pattern para SPAs com API autenticada

```javascript
const puppeteer = require('puppeteer');

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();

// Interceptar respostas de API
const captured = [];
page.on('response', async (response) => {
  const url = response.url();
  if (url.includes('/entries') && response.status() === 200) {
    try {
      const json = await response.json();
      captured.push({ url, data: json });
    } catch (_) {}
  }
});

await page.goto('https://eventos.chiptiming.com.br/resultados/2026/maratonafortaleza2026', {
  waitUntil: 'networkidle2', timeout: 60000
});

// O browser carrega automaticamente com cookies de sessão
// captured[] terá os dados JSON da API
await browser.close();
```

### ChipTiming — estrutura da API descoberta

- **Base URL:** `https://admin.chiptiming.com.br/api/v2`
- **Evento:** `GET /events/{year}/{slug}` → retorna `{id: 10417, modalities: [...], ...}`
- **Listas:** via `__NEXT_DATA__` → `pageProps.results[].id`
- **Entries:** `GET /events/{eventCode}/results/{listId}/entries?pageSize=50&startPage=0`
  - `startPage` começa em 0
  - `pageSize` até ~200
  - Requer cookies de sessão → usar Puppeteer

---

## Coleta Semanal Automática

- **Cron:** todo domingo 12h (`crontab -l` para verificar)
- **Script:** `node scripts/coleta-semanal.cjs`
- **Log:** `/tmp/coleta-semanal.log`
- **Fontes automáticas:** Central de Resultados + Runking

---

## Regras de Ouro — Nunca Esquecer

### Segurança do banco
- ❌ **NUNCA fazer DELETE sem SELECT COUNT(*) primeiro**
- ❌ **NUNCA ação destrutiva sem confirmar com Renisson**
- ❌ **NUNCA editar `src/index.js` ou `prisma/schema.prisma` sem validação**
- ✅ Sempre usar `ON CONFLICT DO NOTHING` nos INSERTs de scraper
- ✅ Sempre verificar se Race/Result já existe antes de inserir

### Scrapers
- Rate limit: 1s entre requests de scraping
- Deduplicação: Race por `name ILIKE` + data
- IDs: prefixo por fonte (`cr_`, `rk_`, `sc_`, `ct_`)
- Timeout: AbortController com 30-40s por request

### Arquitetura
- Scripts em `scripts/*.cjs` são CommonJS standalone (não importar de `src/`)
- `src/` é ESM — não misturar com require()
- Prisma singleton apenas em `src/lib/prisma.js`
- Rate limit global já configurado no Fastify

---

## Módulos Principais (`src/modules/`)

`auth`, `races`, `results`, `ranking`, `scraper`, `corridas-abertas`, `comunidade`, `coach`, `ia`, `decision`, `cobaia`, `biological`, `gps`, `loja`, `pagamentos`, `organizer`, `analytics`, `social`, `passport`, `subscription`, `league`, `prediction`, `agegroups`, `upload`, `amigo-pace`, `assessoria`

---

## Comandos Frequentes

```bash
# Dev
npm run dev

# Scrapers
node scripts/coleta-semanal.cjs --dry-run
node scripts/coleta-semanal.cjs --fonte runking --semanas 2
node scripts/scraper-chiptiming-puppeteer.cjs --evento maratonafortaleza2026 --ano 2026

# Banco
npx prisma studio
docker compose up -d

# Ver cron
crontab -l
tail -f /tmp/coleta-semanal.log
tail -f /tmp/daily-brief.log
```
