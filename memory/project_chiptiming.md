---
name: Scraper ChipTiming
description: Detalhes técnicos do scraper ChipTiming - Bearer token, API endpoints, limitações
type: project
---

**ChipTiming API descoberta em abril 2026:**

- Portal público: `https://eventos.chiptiming.com.br/resultados/{ano}/{slug}`
- API admin: `https://admin.chiptiming.com.br/api/v2`
- Bearer token hardcoded: `Bearer JgECf44XYsLdNY57m6K9WbLM62GNJhv6HbJ5AgRE6GfOrr0w4xhEiF3Cok0j8Xrz`
- `pageSize` máximo: **50** (API retorna 400 se > 50)
- `startPage` é 0-indexed (página 0 = entradas 1-50, página 1 = entradas 51-100)

**Endpoint de entries:**
`GET /api/v2/events/{eventCode}/results/{listId}/entries?pageSize=50&startPage={n}`

**Como obter metadados do evento:**
- Buscar HTML da página pública e parsear `__NEXT_DATA__` para extrair `eventCode` e lista de IDs
- Os IDs das listas são grandes números (ex: 2947022849), não os IDs pequenos do resultado.chiptiming.com.br

**Scraper:** `scripts/scraper-chiptiming.cjs` (sem Puppeteer — usa Node fetch direto)

**Por que sem Puppeteer:** CORS impede `page.evaluate` de chamar `admin.chiptiming.com.br` de dentro do browser. Node.js fetch direto funciona.

**Maratona Fortaleza 2026:**
- eventCode: 10417, slug: maratonafortaleza2026
- 8 listas (5K/10K/21K/42K × F/M), 8901 resultados importados em 2026-04-13
- raceId no banco: `ct_mnxakm0h`

**Tabela Result:** NÃO tem coluna `updatedAt` — usar apenas `createdAt` nos INSERTs.

**Why:** Evitar erros futuros ao reutilizar o scraper para novos eventos ChipTiming.
**How to apply:** Sempre usar `scraper-chiptiming.cjs` (não puppeteer) e lembrar do pageSize≤50.
