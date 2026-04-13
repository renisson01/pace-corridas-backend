---
name: Feedback scraping - Bearer via Node não browser
description: Nunca usar page.evaluate para APIs cross-origin com Bearer token; usar Node fetch direto
type: feedback
---

Nunca usar `page.evaluate` do Puppeteer para chamar APIs de domínios diferentes (cross-origin).

**Why:** CORS impede fetch cross-origin de dentro do browser mesmo com `credentials: 'include'` e token Bearer. Resulta em 403 ou falha silenciosa.

**How to apply:** Para scrapers com Bearer token:
1. Buscar HTML da página via Node `fetch` para extrair metadados (`__NEXT_DATA__`, tokens, etc.)
2. Chamar a API diretamente via Node `fetch` com o Bearer token no header
3. Puppeteer só é necessário quando a autenticação é baseada em cookies de sessão que precisam do browser para serem obtidos — e mesmo assim, interceptar via `page.on('response')` em vez de `page.evaluate`

**Validado em:** ChipTiming (admin.chiptiming.com.br) — curl e Node fetch funcionam, page.evaluate falha.
