# 📡 Fontes de Resultados — Mapa Completo

> Atualizado: 16/abr/2026
> Total mapeado: 33 fontes | 9 ativas | 24 pendentes
> Meta: 10M resultados até Dez/2026

---

## ✅ SCRAPERS PRONTOS E RODANDO (9)

| # | Site | URL | Método | Eventos | Script | Status |
|---|------|-----|--------|---------|--------|--------|
| 1 | ChipTiming | eventos.chiptiming.com.br/resultados | Next.js + Admin API REST (Bearer) | 6.699 | scraper-chiptiming-bulk.cjs | 🔄 70% (4.724/6.699) |
| 2 | Chronomax/Runking | resultados.runking.com.br | Next.js RSC + AES decrypt ({slug}CIPHER$#) | 425 | scraper-runking-historic.cjs | 🔄 50% (215/425) |
| 3 | CronosChip | cronoschip.com.br/resultados | Wiclax CLAX/XML | 100 | scraper-cronoschip.cjs | ✅ concluído |
| 4 | GlobalCrono | globalcronometragem.com.br/resultados | PHP + HTML tables (Cheerio) | 74 | scraper-globalcronometragem.cjs | ✅ concluído |
| 5 | SportsChrono | sportschrono.com.br/resultados-eventos | CLAX XML | ~308 | scraper-sportschrono.cjs | ✅ concluído |
| 6 | CronusTec | cronusteccorridas.com.br/resultados-eventos | CLAX XML | ~318 | scraper-cronustec.cjs | ✅ concluído |
| 7 | Central de Resultados | centralderesultados.com.br/resultados | API POST JSON | ~660 | scraper-central-v3.cjs | ✅ concluído |
| 8 | Race83 | race83.com.br/new/resultados | API JSON | ~29 | race83-scraper-api.cjs | ✅ concluído |
| 9 | RunnerBrasil | runnerbrasil.com.br | ASP.NET HTML | variável | scraper-corridas-brasil.cjs | ✅ concluído |

## 🔨 A CONSTRUIR — PRIORIDADE ALTA (5)

| # | Site | URL | Método | Eventos | Abordagem |
|---|------|-----|--------|---------|-----------|
| 10 | CronosVale | cronosvale.com.br/resultados-eventos | PHP, resultado.php?id=N, AJAX | ~1.110+ | Cheerio + paginar IDs |
| 11 | ChipPower | chipower.com.br/resultados-eventos | PHP, provável CLAX | ? | Investigar CLAX ou HTML |
| 12 | Contime | contime.com.br/category/resultados | WordPress → Central de Resultados | — | **JÁ COBERTO — SKIP** |
| 13 | ForChip | forchip.com.br/v5/resultados.php | PHP + CLAX (g-live.html) | ? | Reusar parser CLAX |
| 14 | SportTimer | sporttimer.com.br/site/resultados_st.php | PHP, 100% JS, AJAX via acao.php | ~2.294 | Puppeteer OU interceptar acao.php |

## 🔨 A CONSTRUIR — PRIORIDADE MÉDIA (12)

| # | Site | URL | Método | Abordagem |
|---|------|-----|--------|-----------|
| 15 | Zenite Esportes | zeniteesportes.com/resultados | HTML | Cheerio |
| 16 | Ativo | ativo.com/eventosrealizados | HTML | Cheerio |
| 17 | Corridão | corridao.com.br/welcome/resultados/2025.html | HTML estático por ano | Cheerio simples |
| 18 | CronoServ | cronoserv.com.br/resultados | HTML | Cheerio |
| 19 | NewTime | newtimecronometragem.com.br/resultados | HTML | Cheerio |
| 20 | TimeCrono | timecrono.com.br/resultados-eventos | Provável CLAX | Reusar parser CLAX |
| 21 | ACrono Esportes | acronoesportes.com.br/resultados-eventos | Provável CLAX | Reusar parser CLAX |
| 22 | ChipVale | chipvale.com.br/resultados | HTML | Cheerio |
| 23 | ChipRun | chiprun.com.br/resultados | HTML | Cheerio |
| 24 | TriChip | trichip.com.br/resultados-eventos-trichip | Provável CLAX | Reusar parser CLAX |
| 25 | EsporteCorrida | esportecorrida.com.br/v3/resultados.php | PHP + CLAX (g-live.html) | Reusar parser CLAX |
| 26 | Assessocor | assessocor.online/resultados | Investigar | Cheerio/Puppeteer |

## 🔨 A CONSTRUIR — DIFÍCIL (5)

| # | Site | URL | Bloqueio | Abordagem |
|---|------|-----|----------|-----------|
| 27 | SouCorredor | soucorredor.com.br/resultados | Investigar | Cheerio/Puppeteer |
| 28 | MinhasInscrições | minhasinscricoes.com.br/pt-br/resultados | Investigar | Cheerio/Puppeteer |
| 29 | BrasilCorrida | brasilcorrida.com.br/#/resultados | SPA (Vue/React) | Puppeteer + API |
| 30 | Races.com.br | races.com.br/#proximoseventos | SPA | Puppeteer |
| 31 | Corrida Superação | corridaderuasuperacao.com.br | HTML estático, poucas | Cheerio |

## 🔴 BLOQUEADO (2)

| # | Site | URL | Bloqueio | Volume |
|---|------|-----|----------|--------|
| 32 | Yescom | ASP.NET com login obrigatório | Nenhuma IA conseguiu quebrar | **~10M+** |
| 33 | ChipBrasil/BRLive | brlive.info + chipbrasil.com.br | Bubble.io SPA, APIs proprietárias | Alto |

---

## Padrões para Reusar

**CLAX (8 sites):** TimeCrono, ACrono, TriChip, ChipPower, ForChip, EsporteCorrida, CronosChip, CronusTec
→ Reusar parser do `scraper-cronoschip.cjs`

**PHP + HTML tables (6 sites):** GlobalCrono, Corridão, CronoServ, NewTime, ChipVale, ChipRun
→ Reusar padrão do `scraper-globalcronometragem.cjs`

**SPA (3 sites):** BrasilCorrida, Races, ChipBrasil
→ Puppeteer com interceptação de API

---

## Prioridade Pós-Launch

1. **SportTimer** (2.294 eventos — maior volume pendente depois de Yescom)
2. **CronosVale** (~1.110 eventos)
3. **CLAX batch** (TimeCrono + ACrono + TriChip + ForChip + EsporteCorrida — 5 fontes com 1 parser)
4. **Cheerio batch** (Corridão + CronoServ + NewTime + ChipVale + ChipRun — 5 fontes com 1 parser)
5. **Yescom** — continuar investigando, potencial de 10M+

## Regra de Ouro
> Só importar corrida de RUA. Sem MTB, trail, swimming, triathlon (exceto a parte de corrida).
> Distâncias aceitas: 3K, 5K, 6K, 7K, 8K, 10K, 12K, 15K, 21K, 42K e variações.
