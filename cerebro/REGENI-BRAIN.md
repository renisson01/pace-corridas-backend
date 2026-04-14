# REGENI BRAIN v3.0 — Fonte Única de Verdade
> Última atualização: 14/Abril/2026 04:15
> CEO: Claude Opus 4.6 | Executor: Claude Code Sonnet | Fundador: Renisson
> Meta: 10M resultados de corrida de rua | Launch: Quinta 17/Abr

---

## Missão
Ser o maior banco de resultados de corrida de rua do Brasil.
O corredor busca seu nome → vê TODOS os seus resultados, pace, posição, histórico.

---

## Stack
| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js (ESM src/, CJS scripts/) |
| Framework | Fastify |
| ORM | Prisma + PostgreSQL |
| Deploy | Railway |
| Frontend | HTML puro em public/ (27 páginas, PWA) |
| IA | Claude API (Anthropic) |
| Scraping | Puppeteer + Cheerio + fetch + crypto-js |
| Notebook | Ubuntu 24/7 (Acer i3 1TB SSD) |
| Claude Code | Sonnet 4.6 no Ubuntu |
| OpenClaw | VPS Hostinger + Docker + Telegram |

---

## Banco de Dados (14/Abr 04:10)

| Métrica | Valor | Tendência |
|---------|-------|-----------|
| Corridas | 1.356 | ↑ subindo |
| Resultados | 521.171 | ↑ subindo rápido |
| Atletas | 385.178 | ↑ subindo |

### Schema Real
```
Athlete { id, name, state, gender, age, birthDate?, equipe?, totalRaces, totalPoints }
Race { id, name, date, city, state, distances, organizer, slug? }
Result { id, athleteId→Athlete, raceId→Race, time(String), pace(String), distance(String "5K"), overallRank?, genderRank?, ageGroup?, points }
@@unique: Result(athleteId, raceId, distance)
```

**Campos são String:** time="01:23:45", pace="4:32", distance="10K"

### Prefixos de ID por Fonte
| Prefixo | Fonte |
|---------|-------|
| ctn_ | Central de Resultados |
| ct_ | CronusTec |
| sc_ | SportsChrono |
| rk_ | Runking/Chronomax |
| r83_ | Race83 |
| cht_ | ChipTiming |
| gc_ | GlobalCronometragem |
| cchip_ | CronosChip |
| rb_ | RunnerBrasil |

---

## Scrapers — Estado Atual

### Rodando Agora (madrugada 14/Abr)
| Scraper | Script | Eventos | PID | Log |
|---------|--------|---------|-----|-----|
| **ChipTiming BULK** | scraper-chiptiming-bulk.cjs | 6.699 (2008-2026) | 347336 | /tmp/chiptiming-bulk.log |
| **Runking Histórico** | scraper-runking-historic.cjs | 425 (Wayback) | 336852 | /tmp/runking-historic-full.log |
| **CronosChip** | scraper-cronoschip.cjs | 100 (Bahia) | 343587 | /tmp/cronoschip-full.log |
| **GlobalCrono** | scraper-globalcronometragem.cjs | 74 (SP) | 342218 | /tmp/globalcron-full.log |

### Prontos (manual)
| Script | Fonte | Eventos |
|--------|-------|---------|
| scraper-central-v3.cjs | Central de Resultados | ~660 |
| scraper-sportschrono.cjs | SportsChrono | ~308 |
| scraper-cronustec.cjs | CronusTec | ~318 |
| race83-scraper-api.cjs | Race83 | ~29 |
| scraper-runking.cjs | Runking (recentes) | ~20/empresa |

### A Construir
| Fonte | URL | Volume | Dificuldade |
|-------|-----|--------|-------------|
| Contime | contime.com.br/category/resultados | Alto | Média |
| ChipPower | chipower.com.br/resultados-eventos | Alto | Média (CLAX?) |
| CronosVale | cronosvale.com.br/resultados-eventos | Médio | Média (PHP custom) |
| SportTimer | sporttimer.com.br/site/resultados_st.php | Médio | Baixa (PHP) |
| ForChip | forchip.com.br/v5/resultados.php | Médio | Baixa (PHP) |
| Zenite | zeniteesportes.com/resultados | Médio | Média |
| Corridão | corridao.com.br/welcome/resultados | Baixo | Baixa (HTML) |
| CronoServ | cronoserv.com.br/resultados | Médio | Média |
| NewTime | newtimecronometragem.com.br/resultados | Médio | Média |
| TimeCrono | timecrono.com.br/resultados-eventos | Médio | Média (CLAX?) |
| ACrono | acronoesportes.com.br/resultados-eventos | Médio | Média (CLAX?) |
| ChipVale | chipvale.com.br/resultados | Médio | Média |
| ChipRun | chiprun.com.br/resultados | Médio | Média |
| TriChip | trichip.com.br/resultados-eventos-trichip | Médio | Média (CLAX?) |
| SouCorredor | soucorredor.com.br/resultados | Baixo | Média |
| MinhasInscricoes | minhasinscricoes.com.br/pt-br/resultados | Baixo | Média |
| EsporteCorrida | esportecorrida.com.br/v3/resultados.php | Baixo | Baixa (PHP+CLAX) |
| BrasilCorrida | brasilcorrida.com.br/#/resultados | Baixo | Alta (SPA) |
| Assessocor | assessocor.online/resultados | Baixo | Média |
| Races.com.br | races.com.br/#proximoseventos | Baixo | Alta (SPA) |
| RunnerBrasil | runnerbrasil.com.br | Médio | Média (ASP.NET) |
| **Yescom** | ASP.NET login obrigatório | **~10M+** | **MUITO ALTA** |

---

## Fórmulas

### Pace
```
KM_MAP = {42K:42, 21K:21, 15K:15, 12K:12, 10K:10, 8K:8, 7K:7, 6K:6, 5K:5, 3K:3, 2K:2}
km = KM_MAP[distance] || null  // NUNCA || 5
[h,m,s] = time.split(':').map(Number)
sec = h*3600 + m*60 + s
pace = floor(sec/km/60) + ':' + pad(round(sec/km%60))
```

### Pontos
```
totalPoints = totalRaces × 21
```

---

## Regras de Ouro

1. ❌ NUNCA DELETE sem SELECT COUNT primeiro
2. ❌ NUNCA editar index.js, pagamentos.routes.js, schema.prisma
3. ❌ NUNCA push sem autorização do Renisson
4. ✅ Sempre ON CONFLICT DO NOTHING
5. ✅ Sempre git pull --rebase antes de trabalhar
6. ✅ APENAS corrida de rua (não MTB/natação/trail/montanha)
7. ✅ Dados perfeitos > dados muitos

---

## Feature Futura: Edição pelo Atleta

O corredor pode corrigir seus resultados:
- Nome da prova, distância, tempo, colocação, faixa etária, cidade
- Marcado como `editedByAthlete: true`
- Original preservado em `originalData` (JSON)
- Só edita resultados do PRÓPRIO perfil

---

## Deploy & URLs

| Recurso | URL |
|---------|-----|
| Produção | https://web-production-990e7.up.railway.app |
| Repo | github.com/renisson01/pace-corridas-backend |
| DB | postgresql://postgres:sBbOLYIKlSXCXTnLWnYRUTJVAzLUBhhF@caboose.proxy.rlwy.net:31475/railway |

---

## Cronograma Launch

| Dia | Foco |
|-----|------|
| Seg 13 | ✅ Fix scrapers, recálculo pace |
| Ter 14 | ✅ Dedup, navbar, 4 scrapers bulk |
| Qua 15 | Limpeza novos dados, mais scrapers, PWA/APK |
| Qui 17 | 🚀 LAUNCH Play Store |
