# 🎨 AGENTE-QA Dashboard
> Última execução: 16/04/2026, 15:05:31
> Saúde geral: 🟢 **94%** (17/18 checks) — 20328ms

## Status por Página
| Página | Load | Checks | Erros JS | Screenshot |
|--------|------|--------|----------|------------|
| Início | 2996ms ✅ | 4/4 ✅ | 0 ✅ | 🔴 41.5% |
| Resultados | 2274ms ✅ | 4/4 ✅ | 0 ✅ | 🔴 99.5% |
| Atleta | 3459ms ⚠️ | 1/2 ⚠️ | 0 ✅ | 🔴 93.9% |
| Corridas | 2331ms ✅ | 4/4 ✅ | 0 ✅ | ✅ 0.0% |

## APIs
| Endpoint | Status | Tempo |
|----------|--------|-------|
| `/ranking/10km?limit=3` | 200 ✅ | 1471ms ✅ |
| `/ranking/5km?limit=3` | 200 ✅ | 1397ms ✅ |
| `/buscar-atletas?q=RENISSON&limit=3` | 200 ✅ | 521ms ⚡ |
| `/corridas-abertas` | 200 ✅ | 270ms ⚡ |

## Bugs Abertos
- [QA-001] nav NÃO encontrado/visível
- [QA-002] GET /ranking/10km?limit=3 → HTTP 0 — timeout
- [QA-003] GET /ranking/5km?limit=3 → HTTP 0 — timeout
- [QA-004] GET /ranking/5km?limit=3 → HTTP 502

---
_Atualizado automaticamente pelo AGENTE-QA_
