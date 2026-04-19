# 📡 Fontes de Resultados — Mapa Completo

> Atualizado: 2026-04-19
> Total mapeado: 67+ fontes | 15 ativas | em expansão
> Meta: 10M resultados até Dez/2026

**Legenda:** ✅ Scraper ativo no cron | 🆕 Criado, nunca rodou | 🔨 Existe mas incompleto | 🔍 Investigado sem scraper | ❌ Inviável

---

## ✅ FONTES ATIVAS (cron-scrapers.sh, todo dia 3h)

| # | Fonte | Tipo | Script | Eventos | Resultados | Região |
|---|-------|------|--------|---------|-----------|--------|
| 1 | **ChipTiming** | JSON API REST | scraper-chiptiming-resultado.cjs | ~3.2k | 2.420.100 | Nacional |
| 2 | **Runking** (36 empresas) | RSC + AES | scraper-runking.cjs | 444+ | ~50k (parcial) | Nacional |
| 3 | **ChipBrasil** | CLAX+Puppeteer | scraper-chipbrasil.cjs | 226 | 236.455 | DF/GO/SE |
| 4 | **Central de Resultados** | HTML/Cheerio | scraper-central-v3.cjs | 242 | 132.633 | Nacional |
| 5 | **TriChip** | CLAX Wiclax | scraper-trichip.cjs | 514 | 89.537 | RS |
| 6 | **CronosChip** | CLAX | scraper-cronoschip.cjs | 86 | 39.538 | variado |
| 7 | **TimeCrono** | CLAX | scraper-timecrono.cjs | 65 | 25.792 | PE |
| 8 | **GlobalCronometragem** | HTML/Cheerio | scraper-globalcronometragem.cjs | 68 | 17.536 | SP |
| 9 | **ACrono** | CLAX | scraper-acrono.cjs | 5 | 1.831 | MT |
| 10 | **SMCrono** | CLAX | scraper-smcrono.cjs | 69 | ~16k (em curso) | SC/Sul |
| 11 | **MyCrono** | RaceZone JSON | scraper-racezone.cjs | 79 | em curso | SC/NE/PB |
| 12 | **SportsChrono** | RaceZone JSON | scraper-racezone.cjs | 15 | 270.325 | SE |
| 13 | **RaceMS** | RaceZone JSON | scraper-racezone.cjs | 9 | em curso | MS |
| 14 | **ChiPower** 🆕 | CLAX | scraper-chipower.cjs | 102 | 0 (nunca rodou) | AL/NE |
| 15 | **CronoCorridas** 🆕 | CLAX | scraper-cronocorridas.cjs | 57 | 0 (nunca rodou) | SP/Interior |

---

## RUNKING — 36 Empresas (cobertas automaticamente)

`o2-correbrasil`(103) · `run-sports`(35) · `iguana-sports`(27) · `vega-sports`(26) · `neorace`(23) · `sagaz-esportes`(21) · `chronomax`(21) · `beta-sports`(21) · `x3m`(16) · `sportsland`(15) · `letape-brasil`(13) · `ht-sports`(13) · `kenya`(11) · `noblu-sport`(10) · `ea-run`(8) · `pepper-sports`(7) · `clube-dos-corredores-de-porto-alegre`(5) · `a-tribuna`(5) · `zenite-sports`(4) · `3a-eventos` · `5-oceans` · `balax` · `bee-sports` · `bex-eventos` · `braves` · `bronkos-race` · `digitime` · `fidalgo-eventos` · `forchip` · `grupo-stc-eventos-ltda` · `hp-cronometragem` · `krono` · `ponto-org` · `sana-sports` · `wtr` · `youp`

---

## 🔍 INVESTIGADOS — Sem Scraper Ainda

| Site | Tipo identificado | Potencial | Barreira | Prioridade |
|------|------------------|-----------|----------|------------|
| **CronosCariri** (cronoscariri.com.br) | SPA React + API Laravel `/api` | CE/Cariri | Endpoints de resultados não mapeados | 🔴 Alta |
| **Morro-MT** (morro-mt.com.br) | App Laravel, 50+ slugs `/resultados/{slug}` | ~600 eventos, MT | Puppeteer ou HTML/slug | 🟡 Média |
| **APCrono** (apcrono.com.br) | WordPress, 39 páginas de resultados | NE/RN | Cheerio por página | 🟡 Média |
| **SuperCrono** (supercrono.com.br) | Site ativo (HTTP 200) mas /resultados dá 403 | SC | nginx bloqueando | 🟡 Média |
| **CronoTag** (cronotag.com.br) | HTTP 301, `/v2/eventos.php` com erro | variado | API quebrada | 🔵 Baixa |
| **CronoServ** (cronoserv.com.br) | HTTP 403 | variado | Bloqueando scrapers | 🔵 Baixa |
| **CorreParaíba** (correparaiba.com) | Retorna 355 bytes (erro/manutenção) | PB | Site instável | 🔵 Baixa |
| **PiCrono** (picrono.com.br) | HTTP 301, conteúdo não mapeado | variado | A investigar | 🔵 Baixa |
| **SmartTimer** (smarttimer.com.br) | HTTP 301 | variado | A investigar | 🔵 Baixa |
| **SPrintTime** (sprinttime.com.br) | HTTP 301, `/v1` não encontrado | variado | A investigar | 🔵 Baixa |
| **RunningTag** (runningtagcronometragem.com.br) | HTTP 000 — fora do ar | variado | Site down | ❌ |

---

## ❌ DESCARTADOS (não publicam resultados)

| Site | Tipo real |
|------|-----------|
| EstouNessa | Plataforma de inscrições |
| IncentivoEsporte | Incentivos/patrocínio |
| Ingresso84 | Ingressos/inscrições |
| AssessorCor | Assessoria de corrida |
| OnSports | Organizadora — resultados via terceiros |
| TBH Esportes | Organizadora — resultados via terceiros |
| TFSports | Track&Field (loja) — resultados via ChipTiming |
| RaveliSports | Organizadora — resultados via terceiros |
| O2Corre | Redireciona para ForChip (sem API) |
| RoadRunners.run | Calendário de eventos futuros (SE) — não resultados |

---

## TECNOLOGIAS

| Tech | Scrapers usando | Dificuldade |
|------|----------------|-------------|
| **Wiclax CLAX (XML)** | TimeCrono, CronosChip, TriChip, ACrono, SMCrono, ChiPower, CronoCorridas, ChipBrasil | ⭐ Fácil — parser compartilhado |
| **RaceZone JSON** | SportsChrono, MyCrono, RaceMS | ⭐ Muito fácil — JSON puro sem auth |
| **ChipTiming REST** | ChipTiming | ⭐ Fácil |
| **Runking RSC+AES** | 36 empresas | ⭐⭐ Médio |
| **HTML/Cheerio** | GlobalCronometragem, Central | ⭐⭐ Médio — frágil |
| **Puppeteer** | ChipBrasil | ⭐⭐⭐ Lento |
| **Laravel API** | CronosCariri | A mapear |
| **Laravel HTML** | Morro-MT | A implementar |

---

## COBERTURA GEOGRÁFICA

| Estado | Nível | Fonte principal |
|--------|-------|----------------|
| SP | ✅ Alta | ChipTiming, Runking, CronoCorridas |
| RJ | ✅ Alta | ChipTiming, Runking |
| MG | ✅ Média | ChipTiming |
| RS | ✅ Alta | TriChip, Runking |
| SC | ✅ Média | SMCrono, MyCrono |
| PR | ✅ Média | ChipTiming, Runking |
| BA | ✅ Média | ChipTiming |
| SE | ✅ Média | SportsChrono |
| PE | ✅ Média | TimeCrono |
| AL | 🆕 Baixa | ChiPower |
| PB | 🆕 Baixa | MyCrono |
| MS | 🆕 Baixa | RaceMS |
| RN | 🔍 Baixa | APCrono (pendente) |
| CE | 🔍 Baixa | CronosCariri (pendente) |
| MT | 🔍 Baixa | ACrono + Morro-MT (pendente) |
| GO | ✅ Baixa | ChipBrasil |
| DF | ✅ Baixa | ChipBrasil |
| PI | ❌ Zero | — |
| MA | ❌ Zero | — |
| PA | ❌ Zero | — |
| Norte (AM,AC,RO,RR,AP,TO) | ❌ Zero | — |
