# 📋 Relatório Completo QA — 16/04/2026, 16:30:02

## Início (`undefined`)
- **URL:** https://web-production-990e7.up.railway.app/
- **Load:** 3591ms
- **Screenshot diff:** 🔴 41.9%

### Checks
- ✅ `text-exists` — "REGENI" encontrado
- ✅ `element-visible` — nav visível
- ✅ `text-exists` — "Buscar" encontrado
- ✅ `no-console-errors` — Sem erros de console

## Resultados (`undefined`)
- **URL:** https://web-production-990e7.up.railway.app/resultados.html
- **Load:** 2477ms
- **Screenshot diff:** 🔴 99.3%

### Checks
- ✅ `text-exists` — "Ranking" encontrado
- ✅ `element-visible` — nav visível
- ✅ `api-responds` — /ranking/10km?limit=5 → HTTP 200 (2253ms)
- ✅ `no-console-errors` — Sem erros de console

## Atleta (`undefined`)
- **URL:** https://web-production-990e7.up.railway.app/atleta.html
- **Load:** 5229ms
- **Screenshot diff:** 🔴 98.6%

### Checks
- ✅ `no-console-errors` — Sem erros de console

## Corridas (`undefined`)
- **URL:** https://web-production-990e7.up.railway.app/corridas-abertas.html
- **Load:** 2431ms
- **Screenshot diff:** ✅ 0.0%

### Checks
- ✅ `text-exists` — "Corridas Abertas" encontrado
- ✅ `element-visible` — nav visível
- ✅ `element-count-min` — .corrida-card: 20 elementos (mín: 1)
- ✅ `no-console-errors` — Sem erros de console

## APIs
- ✅ `GET /ranking/10km?limit=3` → HTTP 200 (1474ms)
- ✅ `GET /ranking/5km?limit=3` → HTTP 200 (1624ms)
- ✅ `GET /buscar-atletas?q=RENISSON&limit=3` → HTTP 200 (612ms)
- ✅ `GET /corridas-abertas` → HTTP 200 (359ms)