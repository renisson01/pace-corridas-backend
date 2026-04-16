# 🎨 AGENTE-QA Dashboard
> Última execução: 16/04/2026, 16:30:02
> Saúde geral: 🟢 **100%** (17/17 checks) — 22346ms

## Status por Página
| Página | Load | Checks | Erros JS | Screenshot |
|--------|------|--------|----------|------------|
| Início | 3591ms ⚠️ | 4/4 ✅ | 0 ✅ | 🔴 41.9% |
| Resultados | 2477ms ✅ | 4/4 ✅ | 0 ✅ | 🔴 99.3% |
| Atleta | 5229ms 🔴 | 1/1 ✅ | 0 ✅ | 🔴 98.6% |
| Corridas | 2431ms ✅ | 4/4 ✅ | 0 ✅ | ✅ 0.0% |

## APIs
| Endpoint | Status | Tempo |
|----------|--------|-------|
| `/ranking/10km?limit=3` | 200 ✅ | 1474ms ✅ |
| `/ranking/5km?limit=3` | 200 ✅ | 1624ms ✅ |
| `/buscar-atletas?q=RENISSON&limit=3` | 200 ✅ | 612ms ⚡ |
| `/corridas-abertas` | 200 ✅ | 359ms ⚡ |

## Bugs Abertos
- [QA-001] nav NÃO encontrado/visível
- [QA-002] GET /ranking/10km?limit=3 → HTTP 0 — timeout
- [QA-003] GET /ranking/5km?limit=3 → HTTP 0 — timeout
- [QA-004] GET /ranking/5km?limit=3 → HTTP 502
- [QA-005] "Entrar" NÃO encontrado no body
- [QA-006] #tabLogin NÃO encontrado/visível
- [QA-007] "REGENI" NÃO encontrado no body

---
_Atualizado automaticamente pelo AGENTE-QA_
