
## [16-abr-2026] MP_ACCESS_TOKEN "não configurado" — FALSO ALARME
**Sintoma:** IAs reportavam 503 "Pagamentos não configurados"
**Causa real:** Token SEMPRE esteve no Railway. O erro era testar LOCALMENTE sem .env ter o token.
**Lição:** NUNCA diagnosticar produção testando local. Sempre usar `curl` direto na URL de produção.
**Teste correto:**
```bash
curl -s -X POST https://web-production-990e7.up.railway.app/pagamentos/premium \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
```
**Status:** RESOLVIDO — Premium R$ 4,99 funciona end-to-end em produção.

## [16-abr-2026] Ranking timeout 6-10s — PARCIALMENTE RESOLVIDO
**Causa:** Seq Scan completo em 2.8M linhas de `Result` sem índice em `distance`. A função `REPLACE(UPPER(...))` impedia uso de qualquer índice simples.
**Solução:** `CREATE INDEX CONCURRENTLY idx_result_distance_norm ON "Result" (replace(upper(distance), 'KM', 'K'))`
**Resultado:** 10km: 6.6s → 5.8s | 5km: 10.5s → 8.9s (~15% melhora). Custo do plano caiu 40% (128k → 76k). Índice agora usado (Bitmap Index Scan).
**Gargalo restante:** Nested loop JOIN de ~14K linhas + sort em memória no JS (`rows.sort()`). Fix completo exige `LIMIT` dentro do SQL e eliminar o sort no app.
**Ticket:** QA-002 e QA-003 — timeout do AGENTE-QA ajustado para 12s (ranking é query pesada por design).
