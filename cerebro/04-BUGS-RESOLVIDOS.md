
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
