---
name: Sistema de Identidade do Atleta
description: Arquitetura de deduplicação e cruzamento de informações de atletas por CPF, birthDate e similarity
type: project
---

**Objetivo:** Ser referência em resultados de corrida no Brasil através de identidade unificada do atleta.

**Estado atual (2026-04-13):**
- 810.888 atletas no banco, 619.210 resultados
- 0 atletas com birthDate (bug nos scrapers — ON CONFLICT DO NOTHING não atualiza)
- 144.477 grupos de nomes exatos duplicados → 362.421 a remover
- pg_trgm habilitado no Railway

**Scripts disponíveis:**
- `scripts/unir-atletas.cjs` — merge por nome exato, similarity (pg_trgm), ou identidade manual com CPF
- `scripts/deduplicar-atletas.cjs` — análise por birthDate + nome

**Identificadores por prioridade:**
1. CPF (auto-declarado pelo atleta via perfil)
2. Data de nascimento (Central de Resultados tem `data_nascimento`, CronusTec tem campo `dn`)
3. Nome + gênero + estado

**Threshold de similarity seguro:** 0.70 para nomes com acento/sem acento; 0.85 para typos

**Bug crítico:** scrapers criam novo Athlete a cada run (sem unique constraint por nome)
- Fix: unique index por (name, gender) + ON CONFLICT DO UPDATE SET birthDate

**Why:** Renisson tem 8 variações de nome no banco com 10 resultados distribuídos.
**How to apply:** Sempre usar unir-atletas.cjs antes de mostrar histórico ao usuário; implementar UI de claim de perfil com CPF como próxima feature.
