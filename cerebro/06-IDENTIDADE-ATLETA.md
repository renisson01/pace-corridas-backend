# Sistema de Identidade do Atleta — Identity Resolution

← [[00-INDEX]]

> **Objetivo:** Ser a maior e mais confiável base de resultados de corrida do Brasil.  
> **Problema central:** O mesmo atleta aparece em múltiplos sites com variações de nome.  
> **Solução:** Cruzamento por CPF + data de nascimento + similarity de nome.

---

## O Problema

### Exemplo real — Renisson Nascimento Aragão
O mesmo atleta aparece 8 vezes no banco com nomes diferentes:

| Nome no banco | Fonte | Similaridade | Resultados |
|---------------|-------|-------------|-----------|
| RENISSON NASCIMENTO ARAGÃO | SportsChrono | 1.00 | 4 |
| RENISSON NASCIMENTO ARAGÃO | Contime | 1.00 | 1 |
| RENISSON NACIMENTO ARAGÃO | SportsChrono | 0.83 | 1 |
| RENISSON NASCIMENTO ARAGAO | Contime | 0.80 | 1 |
| RENISSON NASCIMENTO ARAGAO | SportsChrono | 0.80 | 1 |
| RENISSON NASICMENTO ARAGÃO | Contime | 0.74 | 1 |
| RENISSON NASCIMENTO | SportsChrono | 0.74 | 1 |

**Impacto:** O atleta perde visibilidade de seu histórico completo. O produto perde credibilidade.

### Escala do problema (abril 2026)
- 810.888 atletas no banco
- 144.477 grupos com nome exato duplicado (mesmo gênero) → 362.269 a remover
- 18 grupos sem gênero → 152 a remover
- **Total seguro para remover: ~362.421 registros**

---

## Identificadores Disponíveis (por prioridade)

| Identificador | Força | Disponível em |
|--------------|-------|--------------|
| CPF | ⭐⭐⭐⭐⭐ Único nacional | Apenas via auto-declaração do atleta |
| Data de nascimento | ⭐⭐⭐⭐ Forte | Central de Resultados (data_nascimento), CronusTec (campo `dn`) |
| Nome + gênero + estado | ⭐⭐⭐ Médio | Todos os scrapers |
| Similarity de nome (pg_trgm) | ⭐⭐ Fuzzy | Calculado no banco |

### O que cada scraper retorna
| Scraper | CPF | Data Nasc | Gênero | Estado |
|---------|-----|-----------|--------|--------|
| Central de Resultados | ❌ | ✅ `data_nascimento` | ✅ | Texto livre |
| CronusTec CLAX | ❌ | ✅ campo `dn` | ✅ | `ip4` |
| SportsChrono | ❌ | ❌ (só idade) | ✅ | `ct.uf` |
| ChipTiming | ❌ | ❌ (só idade) | ✅ | N/A |

---

## Arquitetura de Identidade

### Fase atual (sem schema change)
Usar `scripts/unir-atletas.cjs` para mesclar duplicatas:

```bash
# 1. Análise (sem deletar nada)
node scripts/unir-atletas.cjs

# 2. Buscar variações de um atleta
node scripts/unir-atletas.cjs --atleta "RENISSON" --buscar

# 3. Registrar identidade com CPF e data (dry-run primeiro)
node scripts/unir-atletas.cjs --nome "NOME COMPLETO" --cpf "000.000.000-00" --birth "DD/MM/YYYY"

# 4. Executar a unificação
node scripts/unir-atletas.cjs --nome "..." --cpf "..." --birth "..." --execute

# 5. Merge em massa por fase
node scripts/unir-atletas.cjs --fase 1 --execute  # nome exato + mesmo gênero
node scripts/unir-atletas.cjs --fase 2 --execute  # nome exato sem gênero
node scripts/unir-atletas.cjs --fase 3 --threshold 0.85 --execute  # similarity
```

### Fase futura (com schema change)
Adicionar ao modelo `Athlete`:
```prisma
model Athlete {
  // campos existentes...
  masterAthleteId  String?   // aponta para o atleta canônico
  masterAthlete    Athlete?  @relation("AthleteAlias", fields: [masterAthleteId], references: [id])
  aliases          Athlete[] @relation("AthleteAlias")
  cpfHash          String?   // SHA256(CPF) — nunca o CPF em claro
  birthDate        DateTime? // já existe mas nunca populado
}
```

**Por que `masterAthleteId` em vez de deletar?**
- Reversível — se o merge foi errado, desfaz sem perda de dados
- Histórico preservado (qual fonte usou qual nome)
- Permite mostrar "também aparece como: RENISSON ARAGAO" no perfil

### Diagrama de cruzamento

```
CPF (usuário fornece) ──────────────────────► AthleteIdentity
                                                    │
birthDate + similarity(name) > 0.70 ──────────────► │
                                                    │
Exato: name + gender ──────────────────────────────► │
                                                    │
                                              todos os Athlete
                                              com masterAthleteId = this
                                                    │
                                              TODOS os Result[]
                                              (histórico unificado)
```

---

## Entrada Manual de Resultados

### Filosofia
> O atleta não vai mentir porque ele está construindo o próprio histórico.  
> Quando tivermos massa crítica de usuários, eles mesmos inserirão resultados diariamente.

### UI proposta (na aba Perfil)
1. Botão "Adicionar Resultado" → modal
2. Campos: Corrida (busca por nome/data), Distância, Tempo, Posição Geral (opcional)
3. Salvo como `Result` com `source: 'manual'`
4. Aparece no histórico com badge "auto-declarado"

### Endpoint a criar
```
POST /resultados/manual
Body: { raceName, raceDate, raceCity, distance, time, pace }
Auth: JWT obrigatório

1. Cria Race se não existir (status: 'manual')
2. Vincula ao Athlete do usuário logado (via user.athleteId)
3. Cria Result com source='manual'
```

---

## Prioridade de implementação

| Prioridade | Ação | Esforço | Impacto |
|------------|------|---------|---------|
| 🔴 AGORA | Executar merge fases 1+2 (362k duplicatas seguras) | 30min | Alto |
| 🔴 AGORA | Corrigir scrapers para salvar birthDate (não só ON CONFLICT) | 2h | Alto |
| 🟡 SEMANA | UI de entrada manual de resultado | 1 dia | Médio |
| 🟡 SEMANA | Endpoint POST /resultados/manual | 2h | Médio |
| 🟢 MÊS | Campo masterAthleteId no schema | 1h | Alto (longo prazo) |
| 🟢 MÊS | Tela de claims "Este perfil é meu?" com CPF | 1 dia | Alto |

---

## Fix crítico: scrapers não salvam birthDate

**Problema:** Todos os scrapers fazem `ON CONFLICT DO NOTHING` no Athlete.  
O Athlete não tem unique constraint por nome — cada run cria um NOVO registro.  
Resultado: birthDate nunca é atualizado em registros existentes.

**Fix para Central de Resultados e CronusTec:**
```sql
-- Em vez de INSERT ... ON CONFLICT DO NOTHING
-- Fazer INSERT depois UPDATE:
UPDATE "Athlete" SET "birthDate" = $birthDate
WHERE name = $name AND "birthDate" IS NULL
```

Ou adicionar unique constraint por nome normalizado:
```sql
CREATE UNIQUE INDEX athlete_name_norm ON "Athlete" (UPPER(TRIM(name)));
-- Então ON CONFLICT (UPPER(TRIM(name))) DO UPDATE SET "birthDate" = EXCLUDED."birthDate"
```

**Risco da unique constraint:** nomes comuns (JOSE DA SILVA) seriam merged incorretamente.  
**Solução:** unique por (name, gender) — mais seguro.

---

## Segurança de dados sensíveis

- **CPF nunca armazenado em claro** — usar SHA256(CPF) + salt para lookup
- **Data de nascimento** é dado pessoal (LGPD) — não exibir publicamente
- **Obsidian** NÃO deve conter CPFs reais — apenas arquitetura e pseudônimos
- **Vault local** com sync via Git privado (NÃO usar Obsidian Sync para dados sensíveis)

---

## Referências

- Script: `scripts/unir-atletas.cjs`
- Script deduplicação: `scripts/deduplicar-atletas.cjs`
- Schema: `prisma/schema.prisma` → model Athlete
- pg_trgm: habilitado no Railway em 2026-04-13
