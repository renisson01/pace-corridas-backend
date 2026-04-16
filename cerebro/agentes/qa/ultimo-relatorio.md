# 📋 Relatório Completo QA — 16/04/2026, 14:34:16

## Início (`undefined`)
- **URL:** https://web-production-990e7.up.railway.app/
- **Load:** 3325ms
- **Screenshot diff:** 🆕 baseline

### Checks
- ✅ `text-exists` — "REGENI" encontrado
- ✅ `element-visible` — nav visível
- ✅ `text-exists` — "Buscar" encontrado
- ✅ `no-console-errors` — Sem erros de console

## Resultados (`undefined`)
- **URL:** https://web-production-990e7.up.railway.app/resultados.html
- **Load:** 2277ms
- **Screenshot diff:** 🆕 baseline

### Checks
- ✅ `text-exists` — "Ranking" encontrado
- ✅ `element-visible` — nav visível
- ✅ `api-responds` — /ranking/10km?limit=5 → HTTP 200 (7678ms)
- ✅ `no-console-errors` — Sem erros de console

## Atleta (`undefined`)
- **URL:** https://web-production-990e7.up.railway.app/atleta.html
- **Load:** 3258ms
- **Screenshot diff:** 🆕 baseline

### Checks
- ❌ `element-visible` — nav NÃO encontrado/visível
- ✅ `no-console-errors` — Sem erros de console

## Corridas (`undefined`)
- **URL:** https://web-production-990e7.up.railway.app/corridas-abertas.html
- **Load:** 2362ms
- **Screenshot diff:** 🆕 baseline

### Checks
- ✅ `text-exists` — "Corridas Abertas" encontrado
- ✅ `element-visible` — nav visível
- ✅ `element-count-min` — .corrida-card: 20 elementos (mín: 1)
- ✅ `no-console-errors` — Sem erros de console

## APIs
- ❌ `GET /ranking/10km?limit=3` → HTTP 0 (4000ms) — timeout
- ❌ `GET /ranking/5km?limit=3` → HTTP 0 (4000ms) — timeout
- ✅ `GET /buscar-atletas?q=RENISSON&limit=3` → HTTP 200 (617ms)
- ✅ `GET /corridas-abertas` → HTTP 200 (275ms)