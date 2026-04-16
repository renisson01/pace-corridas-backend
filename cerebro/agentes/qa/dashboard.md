# 🎨 AGENTE-QA Dashboard
> Última execução: 16/04/2026, 15:21:13
> Saúde geral: 🟢 **100%** (17/17 checks) — 19209ms

## Status por Página
| Página | Load | Checks | Erros JS | Screenshot |
|--------|------|--------|----------|------------|
| Início | 2776ms ✅ | 4/4 ✅ | 0 ✅ | 🔴 41.9% |
| Resultados | 2219ms ✅ | 4/4 ✅ | 0 ✅ | 🔴 99.5% |
| Atleta | 3256ms ⚠️ | 1/1 ✅ | 0 ✅ | 🔴 99.1% |
| Corridas | 2371ms ✅ | 4/4 ✅ | 0 ✅ | ✅ 0.0% |

## APIs
| Endpoint | Status | Tempo |
|----------|--------|-------|
| `/ranking/10km?limit=3` | 200 ✅ | 1483ms ✅ |
| `/ranking/5km?limit=3` | 200 ✅ | 1817ms ✅ |
| `/buscar-atletas?q=RENISSON&limit=3` | 200 ✅ | 555ms ⚡ |
| `/corridas-abertas` | 200 ✅ | 270ms ⚡ |

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
