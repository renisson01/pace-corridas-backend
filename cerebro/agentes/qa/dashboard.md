# 🎨 AGENTE-QA Dashboard
> Última execução: 16/04/2026, 14:34:16
> Saúde geral: 🟡 **83%** (15/18 checks) — 30148ms

## Status por Página
| Página | Load | Checks | Erros JS | Screenshot |
|--------|------|--------|----------|------------|
| Início | 3325ms ⚠️ | 4/4 ✅ | 0 ✅ | 🆕 baseline |
| Resultados | 2277ms ✅ | 4/4 ✅ | 0 ✅ | 🆕 baseline |
| Atleta | 3258ms ⚠️ | 1/2 ⚠️ | 0 ✅ | 🆕 baseline |
| Corridas | 2362ms ✅ | 4/4 ✅ | 0 ✅ | 🆕 baseline |

## APIs
| Endpoint | Status | Tempo |
|----------|--------|-------|
| `/ranking/10km?limit=3` | 0 ❌ | 4000ms 🔴 |
| `/ranking/5km?limit=3` | 0 ❌ | 4000ms 🔴 |
| `/buscar-atletas?q=RENISSON&limit=3` | 200 ✅ | 617ms ⚡ |
| `/corridas-abertas` | 200 ✅ | 275ms ⚡ |

## Bugs Abertos
- [QA-001] nav NÃO encontrado/visível
- [QA-002] GET /ranking/10km?limit=3 → HTTP 0 — timeout
- [QA-003] GET /ranking/5km?limit=3 → HTTP 0 — timeout

---
_Atualizado automaticamente pelo AGENTE-QA_
