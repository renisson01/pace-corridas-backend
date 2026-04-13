# 🧠 REGENI — CONTEXTO COMPLETO
> Arquivo de memória persistente. Atualizar sempre que houver mudanças importantes.
> Última atualização: 12/04/2026

---

## 🏢 O PROJETO

**REGENI** = REGENeração + INteligência  
Plataforma brasileira de corrida de rua e longevidade.  
Missão: **maior banco de resultados de corrida do Brasil**.

**Fundador:** Renisson Nascimento Aragão  
- Corredor competitivo de Itabaiana/SE (~10 anos de experiência)  
- VDOT 70 (meta sub-15:00 nos 5km)  
- athleteId no banco: `a3_e3623fa5690b5286a915`  
- Resultados pessoais: 15K 55:46 | 21K 1:30:22 | 5K 18:55

---

## 🖥️ STACK TÉCNICA

| Item | Detalhe |
|------|---------|
| Backend | Node.js + Fastify + Prisma |
| Banco | PostgreSQL no Railway |
| DB URL | `postgresql://postgres:sBbOLYIKlSXCXTnLWnYRUTJVAzLUBhhF@caboose.proxy.rlwy.net:31475/railway` |
| Deploy | Railway: `https://web-production-990e7.up.railway.app` |
| Repo | `renisson01/pace-corridas-backend` |
| Local | `~/pace-corridas-backend` |
| Notebook | Ubuntu, rodando 24/7 em Itabaiana/SE |

---

## 🗄️ BANCO DE DADOS (estado atual)

```
Corridas:   ~1.400
Atletas:    ~900k
Resultados: ~870k
```

### Schema Athlete
```
id, name, equipe, state, gender, age, birthDate (novo!), cpf, totalRaces, totalPoints
```

### Schema Result  
```
id, athleteId, raceId, time, pace, overallRank, genderRank, ageGroup, distance, points
```

### Schema Race
```
id, name, city, state, date, distances, organizer, status
```

---

## 🤖 SCRAPERS (fontes de dados)

| Scraper | Arquivo | Fonte | Eventos | Status |
|---------|---------|-------|---------|--------|
| RunnerBrasil | scraper-runner.cjs | runnerbrasil.com.br | 502 | ✅ completo |
| Central v3 | scraper-central-v3.cjs | centralderesultados.com.br | 660+ | ✅ completo |
| Contime | importar-contime.cjs | contime.com.br → Central | 321 | ✅ completo |
| Race83 | scraper-race83.cjs | race83.com.br (CLAX) | 33 | ✅ completo |
| SportsChrono | scraper-sportschrono-clax.cjs | sportschrono.com.br (CLAX) | 30 | ✅ completo |
| CronusTec | scraper-cronustec.cjs | cronusteccorridas.com.br (CLAX) | 319 | 🔄 rodando |

### Formato CLAX (XML)
- URL: `https://site.com/resultados/g-live.html?f=evento/ANO/SLUG/SLUG.clax`
- Campos: `n`=nome, `x`=sexo, `a`=ano nascimento, `dn`=data nascimento, `ca`=categoria
- Tempos: `t="00h23'21,224"` → converte para `HH:MM:SS`

### API Central de Resultados
- Busca eventos: `POST /resultados/buscar-resultado` com `txt=`
- Resultados: `POST /resultados/buscar-resultado-evento` com `evento=NUMG`
- Campos: `ds_nome`, `ds_genero`, `data_nascimento`, `tempo_liquido`, `distancia`, `colocacao`

---

## 🐛 BUGS CONHECIDOS

### Críticos (resolver antes do lançamento)
1. **Atletas fragmentados** — mesmo atleta em múltiplos registros com nome levemente diferente
   - Ex: RENISSON tem 10 versões no banco
   - Causa: cada scraper insere sem verificar duplicatas por nome+birthDate
   - Solução: deduplicação por nome + data de nascimento

2. **Nomes "Evento Central XXXX"** — 318 corridas sem nome real
   - Causa: API do Central não retorna nome ao buscar por numg
   - Solução: buscar pelo slug na API `buscar-resultado` com txt=nome

3. **Tempos impossíveis no ranking** — ex: 11:51 no 10km
   - Causa: dados corrompidos ou de provas não corrida (XCO, MTB etc)
   - Solução: filtrar tempos < 25min/5K, < 28min/10K etc

4. **Atletas fantasmas** — 351k atletas sem resultado
   - Causa: INSERT de atletas funciona mas INSERT de resultados falha por unique constraint
   - Solução: DELETE FROM Athlete WHERE NOT IN (SELECT athleteId FROM Result)

5. **Datas erradas** — eventos Contime com data 2026-04-11 (data de importação)
   - Causa: scraper não pegou data real do evento
   - Solução: rebuscar data pela API

### Resolvidos
- ✅ Unique constraint em Result(athleteId, raceId, distance)
- ✅ Eventos XCO/MTB/Trail deletados (4.265 resultados removidos)
- ✅ Atletas DESCONHECIDO/COMPETIDOR deletados (1.557 removidos)
- ✅ birthDate adicionado ao schema

---

## 📱 PÁGINAS DO APP

### Ativas (13 páginas)
| Página | Arquivo | Status |
|--------|---------|--------|
| Home | index.html | ✅ |
| Resultados/Ranking | resultados.html | ✅ funcional |
| Perfil Atleta | perfil-atleta.html | ✅ funcional |
| Corridas Abertas | corridas-abertas.html | ✅ |
| IA Coach | ia.html | ✅ |
| Perfil usuário | perfil.html | ✅ |
| Comunidade | comunidade.html | ✅ |

### API Endpoints principais
```
GET  /athletes/search?name=X&birthYear=Y
GET  /perfil-atleta/:id
GET  /ranking/:dist km
GET  /ranking/prova/:raceId
GET  /analytics/overview
GET  /provas
GET  /buscar-atletas?nome=X
```

---

## 🚀 ROADMAP DE LANÇAMENTO

| Data | Evento |
|------|--------|
| **Sexta-feira 17/04** | Lançamento Play Store — Aba Resultados + Perfil Atleta |
| Semana seguinte | Aba Corridas Abertas |
| +15 dias | Aba IA Coach + Aba Treinador |

---

## 💰 MONETIZAÇÃO

| Plano | Preço | Features |
|-------|-------|---------|
| Free | R$0 | Busca resultados, perfil básico |
| Premium | R$29,90/mês | IA Coach, análises avançadas |
| Coach | R$99,90 onboarding + R$3,99/atleta/mês | Gestão de equipe |
| REGENI Health (futuro) | R$99,90/mês | Biomarkers, longevidade |

Pagamentos via **Mercado Pago Pix**.

---

## 🧠 SEGUNDO CÉREBRO (Obsidian)

- Vault: `~/pace-corridas-backend/cerebro/`
- Daily Brief: gerado todo dia às 7h via cron
- Arquivo: `cerebro/daily/YYYY-MM-DD.md`
- Cron: `0 7 * * * cd ~/pace-corridas-backend && node scripts/daily-brief.cjs`

---

## 🤖 AGENTES E IA

- **Claude Code** v2.1.97 — instalado, usa OAuth Pro
- **OpenClaw** (Telegram bot) — pausado, Anthropic não aceita mais
- **IA Coach** — sistema de treino com VDOT/Daniels, arquivo `ia.routes.js`

---

## ⚠️ DECISÕES IMPORTANTES

1. **Não deduplicar só por nome** — Brasil tem 78k "Maria José da Silva"
2. **Deduplicação correta** = nome + data de nascimento
3. **Não lançar com dados ruins** — credibilidade é tudo no mercado de corrida
4. **birthDate** agora coletado em todos os scrapers (CLAX: campo `dn`, Central: `data_nascimento`)
5. **Eventos excluídos**: XCO, MTB, bike, ciclismo, trilha, trail, duatlo, triatlo
