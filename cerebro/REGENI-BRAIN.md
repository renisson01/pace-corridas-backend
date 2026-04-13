# REGENI BRAIN v2.0 — Fonte Única de Verdade
> **Última atualização:** 13/Abril/2026 18:00
> **CEO:** Claude (Anthropic) | **Fundador/Dev:** Renisson | **Executor:** Claude Code (Sonnet)
> **Objetivo:** Play Store launch **quinta 17/Abril/2026**

---

## 🎯 META DA SEMANA (13-17 Abril)

**Launch com 3 abas apenas:**
1. 🔍 **Resultados** — busca por nome de atleta
2. 👤 **Perfil do Atleta** — histórico de corridas, melhor pace
3. 🏃 **Corridas Abertas** — calendário de próximas corridas

**Tudo mais fica escondido** (navbar limpa, sem links para features inativas).

---

## 📊 ESTADO DO BANCO (atualizado 13/Abr 18h)

| Métrica | Valor | Status |
|---------|-------|--------|
| Corridas (Race) | ~1.494 | ✅ |
| Atletas (Athlete) | ~959.000 | ⚠️ ~248k duplicados |
| Resultados (Result) | ~619.210 | ✅ Pace recalculado |
| Pace recalculado | 618.486 | ✅ Feito hoje |
| Sem pace (dist lixo) | 444 | ⚠️ Limpar |
| Pace < 1:30/km | 328 | ⚠️ Tempos de chip errados |
| Pace > 20:00/km | 56.257 | ℹ️ Caminhantes reais |
| Scrapers corrigidos (||5 bug) | 5/5 | ✅ Feito hoje |
| Fruticultura 3K→21K | 1.338 | ✅ Feito hoje |
| Distâncias lixo | ~724 | ⚠️ Normalizar |
| Grupos duplicados (nome+estado) | 101.364 | 🔴 Próximo |

---

## 🏗️ ARQUITETURA REAL (não usar o PDF como referência)

### Stack
| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js (ESM em `src/`, CJS em `scripts/`) |
| Framework | **Fastify** (NÃO Express) |
| ORM | **Prisma** + PostgreSQL |
| Deploy | **Railway** |
| Auth | JWT (30d) + legacy base64url (migração incremental) |
| IA | Claude API (Anthropic) via `ANTHROPIC_API_KEY` |
| Pagamentos | MercadoPago PIX |
| Scraping | Puppeteer + Cheerio + fetch |
| Frontend | HTML puro em `public/` (27 páginas, sem framework) |

### Estrutura de Pastas
```
pace-corridas-backend/
├── src/                    ← ESM (import/export)
│   ├── index.js            ← entry point (NUNCA editar sem validação)
│   ├── agents/index.js     ← 12 cron agents
│   ├── lib/prisma.js       ← singleton PrismaClient
│   ├── middlewares/
│   └── modules/            ← 30 módulos
├── prisma/
│   └── schema.prisma       ← 35+ modelos (NUNCA editar sem validação)
├── public/                 ← 27 páginas HTML (PWA)
├── scripts/                ← scrapers .cjs (CommonJS standalone)
├── cerebro/                ← Obsidian vault (este arquivo)
└── memory/                 ← MEMORY.md para Claude Code
```

### Schema Real dos Modelos Críticos (banco atual)
```
Athlete {
  id        String @id (cuid)
  name      String
  equipe    String?
  state     String?
  gender    String?    (M/F)
  age       Int?
  birthDate DateTime?  (quase sempre NULL — corrigir)
  totalRaces  Int
  totalPoints Int      (21 × totalRaces)
  user      User?
}

Race {
  id        String @id (cuid)
  name      String
  date      DateTime
  city      String
  state     String
  distances String     ("5K,10K,21K" texto livre)
  organizer String
  source    String
  slug      String?
  results   Result[]
}

Result {
  id          String @id (cuid)
  athleteId   String → Athlete
  raceId      String → Race
  time        String    ("HH:MM:SS" ou "MM:SS")
  pace        String?   ("4:32" — recém recalculado)
  overallRank Int?
  genderRank  Int?
  ageGroup    String?
  distance    String?   ("10K", "21K")
  points      Int       (default 0)
  @@unique([athleteId, raceId, distance])
}
```

**⚠️ IMPORTANTE:** `time` e `pace` são **String**, não numéricos. `distance` é **String** ("5K"), não metros. O PDF de especificação usa schema diferente (RaceResult, timeSec, distanceKm) — **IGNORAR o PDF, usar o schema real acima.**

---

## 📋 PLANO DIA A DIA

### ✅ SEGUNDA 13/Abr — CONCLUÍDO
- [x] Fix scrapers: removido `|| 5` fallback em 5 arquivos
- [x] Fix Fruticultura: 1.338 resultados 3K→21K + pace recalculado
- [x] Recálculo de pace em massa: 618.486 resultados
- [x] Diagnóstico: 101.364 grupos duplicados, 724 distâncias lixo
- [x] Limpou 9 resultados com tempo 00:00:0X

### 🔵 TERÇA 14/Abr — DEDUP + NORMALIZAÇÃO
**Manhã: Normalizar distâncias lixo**
```sql
-- Normalizar formatos alternativos
UPDATE "Result" SET distance = '3K' WHERE distance IN ('3km','3 km','3KM');
UPDATE "Result" SET distance = '5K' WHERE distance IN ('5km','5 km','5KM');
UPDATE "Result" SET distance = '2K' WHERE distance IN ('2km','2 km','2KM');
-- Nullar distâncias inválidas (ciclismo, categorias como distância, etc)
UPDATE "Result" SET distance = NULL, pace = NULL
WHERE distance IN ('DESC','Desc','CICLISMO','BIKE','CICLISMO ADULTO VISITANTE',
  'NELORE','MASTER 2','ELITE MASC','ELITE FEM')
OR distance LIKE '%ADULTO%' OR distance LIKE '%ELITE%' OR distance LIKE '%MASTER%';
-- Recalcular pace dos normalizados
-- (usar mesma fórmula do scraper)
```

**Tarde: Deduplicação Fase 1 (segura)**
```bash
node scripts/unir-atletas.cjs --fase 1 --execute
# Fase 1 = nome exato + mesmo gênero + mesmo estado
# ~248k registros a fundir → reduz banco para ~710k atletas
```

**REGRA:** Fazer SELECT COUNT antes. Se afetar > 300k, pedir confirmação ao Renisson.

### 🔵 QUARTA 15/Abr — FRONTEND + PWA
**Manhã: Navbar — esconder abas inativas**
- Mostrar apenas: Resultados, Perfil, Corridas Abertas
- Esconder: Rankings, Treinos, IA, Coach, Cobaia, Loja, Admin, GPS, etc.
- Garantir que URLs diretas das páginas ocultas retornem 404 ou redirect

**Tarde: PWA + Play Store prep**
- Verificar `manifest.json` (nome: REGENI, cores, ícones 192+512)
- Verificar `sw.js` (cache das 3 páginas visíveis)
- Build APK com Bubblewrap/TWA
- Screenshots das 3 telas para Play Store listing
- Descrição da loja em pt-BR

### 🔵 QUINTA 17/Abr — LAUNCH 🚀
- Deploy final no Railway
- Testes pós-deploy das 3 telas
- Upload APK na Google Play Console
- Anunciar (redes sociais, comunidades de corrida)

---

## 🕷️ SCRAPERS — Estado Atual

### Ativos (automático via coleta-semanal.cjs — dom 12h)
| Fonte | Script | Região | Bug ||5 |
|-------|--------|--------|---------|
| Central de Resultados | `scraper-central-v3.cjs` | Nordeste | ✅ Fixado |
| Runking/Chronomax | `scraper-runking.cjs` | Nacional | N/A |

### Ativos (manual)
| Fonte | Script | Região | Bug ||5 |
|-------|--------|--------|---------|
| CronusTec | `scraper-cronustec.cjs` | Bahia | ✅ Fixado |
| SportsChrono | `scraper-sportschrono.cjs` | Sergipe | ✅ Fixado |
| ChipTiming | `scraper-chiptiming.cjs` | SP/CE | ✅ Fixado |
| Race83/CLAX | `race83-scraper-api.cjs` | Nacional | N/A |
| RunnerBrasil | `scraper-corridas-brasil.cjs` | Nacional | ✅ Fixado |

### Pendentes
| Fonte | Bloqueio |
|-------|---------|
| Yescom | Login ASP.NET obrigatório |
| ChipTiming API | Token JWT necessário → Puppeteer |
| CorridasBR | Investigar |
| Figueiredos | Investigar |

### Fontes de birthDate
| Scraper | Campo | Status |
|---------|-------|--------|
| Central de Resultados | `data_nascimento` | ⚠️ Scraper não salva no Athlete |
| CronusTec | `dn` (data nascimento) | ⚠️ Scraper não salva no Athlete |
| SportsChrono | só idade | ❌ |
| ChipTiming | só idade | ❌ |

**FIX NECESSÁRIO (pós-launch):** Scrapers Central e CronusTec devem UPDATE birthDate no Athlete existente.

---

## 🧬 IDENTIDADE DO ATLETA

### Problema
O mesmo atleta aparece fragmentado. Ex: Renisson → 7 registros diferentes.

### Solução em Fases
| Fase | Critério | Registros | Risco | Status |
|------|----------|-----------|-------|--------|
| 1 | Nome exato + gênero + estado | ~248k | Baixo | 🔵 Terça |
| 2 | Nome exato sem gênero | ~152 | Baixo | Pós-launch |
| 3 | Similarity > 0.85 + birthDate | TBD | Médio | Pós-launch |
| 4 | masterAthleteId no schema | N/A | Baixo | Mês que vem |

### Script
```bash
node scripts/unir-atletas.cjs --fase 1 --execute  # nome+gênero+estado
node scripts/unir-atletas.cjs --fase 2 --execute  # nome sem gênero
node scripts/unir-atletas.cjs --fase 3 --threshold 0.85 --execute  # similarity
```

---

## ⚖️ REGRAS DE OURO (TODOS os agentes)

### Segurança do Banco
1. ❌ **NUNCA DELETE sem SELECT COUNT primeiro**
2. ❌ **NUNCA ação destrutiva sem confirmar com Renisson**
3. ❌ **NUNCA editar `src/index.js`, `pagamentos.routes.js` ou `schema.prisma`**
4. ✅ Sempre `ON CONFLICT DO NOTHING` nos INSERTs de scraper
5. ✅ Sempre `git pull --rebase` antes de trabalhar

### Claude Code (Sonnet no Ubuntu)
- Máximo 3 tentativas por problema
- Máximo 10 min por item
- NUNCA push sem autorização explícita do Renisson
- Modelo: Haiku para tarefas simples
- Sempre ler `cerebro/` antes de começar sessão

### OpenClaw (REGENIBOT no VPS)
- Nunca push sem autorização
- Nunca editar `index.js`, `pagamentos.routes.js`, `schema.prisma`
- Max 3 tentativas, max 10 min

---

## 🔢 FÓRMULAS CORRETAS

### Pace (min/km)
```
// distance é String ("5K", "10K", etc)
KM_MAP = {'42K':42, '21K':21, '15K':15, '12K':12, '10K':10, '8K':8, '7K':7, '6K':6, '5K':5, '3K':3, '2K':2, '1K':1}
km = KM_MAP[distance] || null  // NUNCA usar || 5

// time é String "HH:MM:SS"
[h, m, s] = time.split(':').map(Number)
totalSeconds = h * 3600 + m * 60 + s

paceSeconds = totalSeconds / km
paceMin = floor(paceSeconds / 60)
paceSec = round(paceSeconds % 60)
pace = `${paceMin}:${paceSec.toString().padStart(2,'0')}`

// Validação: pace < 1:30 ou > 20:00 → suspeito
```

### Pontos
```
totalPoints = totalRaces × 21
// 21 = referência à meia maratona (42/2)
```

---

## 🔗 REFERÊNCIAS

| Recurso | Caminho/URL |
|---------|-------------|
| Repo | `github.com/renisson01/pace-corridas-backend` |
| Live | `https://web-production-990e7.up.railway.app` |
| DB URL | `postgresql://postgres:sBbOLYIKlSXCXTnLWnYRUTJVAzLUBhhF@caboose.proxy.rlwy.net:31475/railway` |
| Renisson athleteId | `a3_e3623fa5690b5286a915` (SE, 1 resultado) |
| Obsidian vault | `cerebro/` |
| Claude Code memory | `memory/MEMORY.md` |

---

## 📌 DECISÕES TÉCNICAS VIGENTES

| ID | Decisão | Razão |
|----|---------|-------|
| DEC-001 | Fastify, não Express | Performance 2x, plugin system |
| DEC-002 | ESM em src/, CJS em scripts/ | Modernização + compatibilidade |
| DEC-003 | HTML puro, sem React/Vue | Zero build, deploy simples |
| DEC-004 | JWT + legacy auth coexistem | Migração incremental |
| DEC-005 | Prisma singleton em lib/ | Evitar pool exhaustion |
| DEC-006 | time/pace como String | Scrapers trazem formatado |
| DEC-007 | Dedup corrida: nome+data+cidade | Múltiplos scrapers mesma corrida |
| DEC-008 | 21 pts fixos por corrida | Referência meia maratona |
| DEC-010 | SQL raw no ranking | DISTINCT ON sem equivalente Prisma |
| DEC-011 | Scraper 3 tiers | Cheerio < Puppeteer < JSON API |

---

## ⚠️ PDF DE ESPECIFICAÇÃO vs REALIDADE

O PDF `REGENI_Especificacao_Tecnica_Completa.pdf` (Abril 2025) está **desatualizado** em vários pontos:

| PDF diz | Realidade |
|---------|-----------|
| Schema: `RaceResult`, `timeSec`, `distanceKm` | Real: `Result`, `time` (String), `distance` (String "5K") |
| OpenAI GPT-4o | Real: Claude API (Anthropic) |
| server.js como entry point | Real: `src/index.js` |
| Tiers: free/premium/elite/coach | Real: simplificado (isPremium, isCoach booleans) |
| 48+ modelos Prisma | Real: 35+ modelos |
| Preço Premium R$29,90 | Real: R$9,99/mês |

**Regra: Sempre usar este BRAIN como referência, não o PDF.**

---

## 📈 MÉTRICAS DE VALIDAÇÃO (pós-cleanup)

- [ ] Pace médio 5K elite: 2:50-3:20/km
- [ ] Pace médio 5K amador: 5:00-8:00/km
- [ ] Zero resultados com pace < 2:00/km (impossível)
- [ ] Máximo 5% com pace > 15:00/km
- [ ] 3 telas carregando < 3s
- [ ] Busca por nome retornando < 1s
- [ ] APK instalável via Play Store
