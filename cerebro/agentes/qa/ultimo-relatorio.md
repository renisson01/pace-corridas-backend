# 📋 Relatório Completo QA — 16/04/2026, 15:21:13

## Início (`undefined`)
- **URL:** https://web-production-990e7.up.railway.app/
- **Load:** 2776ms
- **Screenshot diff:** 🔴 41.9%

### Checks
- ✅ `text-exists` — "REGENI" encontrado
- ✅ `element-visible` — nav visível
- ✅ `text-exists` — "Buscar" encontrado
- ✅ `no-console-errors` — Sem erros de console

## Resultados (`undefined`)
- **URL:** https://web-production-990e7.up.railway.app/resultados.html
- **Load:** 2219ms
- **Screenshot diff:** 🔴 99.5%

### Checks
- ✅ `text-exists` — "Ranking" encontrado
- ✅ `element-visible` — nav visível
- ✅ `api-responds` — /ranking/10km?limit=5 → HTTP 200 (2449ms)
- ✅ `no-console-errors` — Sem erros de console

## Atleta (`undefined`)
- **URL:** https://web-production-990e7.up.railway.app/atleta.html
- **Load:** 3256ms
- **Screenshot diff:** 🔴 99.1%

### Checks
- ✅ `no-console-errors` — Sem erros de console

## Corridas (`undefined`)
- **URL:** https://web-production-990e7.up.railway.app/corridas-abertas.html
- **Load:** 2371ms
- **Screenshot diff:** ✅ 0.0%

### Checks
- ✅ `text-exists` — "Corridas Abertas" encontrado
- ✅ `element-visible` — nav visível
- ✅ `element-count-min` — .corrida-card: 20 elementos (mín: 1)
- ✅ `no-console-errors` — Sem erros de console

## APIs
- ✅ `GET /ranking/10km?limit=3` → HTTP 200 (1483ms)
- ✅ `GET /ranking/5km?limit=3` → HTTP 200 (1817ms)
- ✅ `GET /buscar-atletas?q=RENISSON&limit=3` → HTTP 200 (555ms)
- ✅ `GET /corridas-abertas` → HTTP 200 (270ms)