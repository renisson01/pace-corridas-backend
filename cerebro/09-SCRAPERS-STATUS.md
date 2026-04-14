# Scrapers — Registro de Fontes

> Cada seção abaixo é uma fonte. O Dataview puxa daqui.

---

## ChipTiming
- **URL:** https://eventos.chiptiming.com.br/resultados
- **Script:** scraper-chiptiming-bulk.cjs
- **Eventos:** 6.699
- **API:** admin.chiptiming.com.br/api/v2 (Bearer token)
- **Região:** Nacional (todos os estados)
- **Status:** 🟢 Rodando (4724/6699)
- **Volume estimado:** 2M+ resultados
- **Observação:** Maior fonte. Desde 2008. Filtro natural: só corrida de rua.

## Runking/Chronomax
- **URL:** https://resultados.runking.com.br
- **Script:** scraper-runking-historic.cjs
- **Eventos:** 425 (via Wayback Machine CDX)
- **API:** RSC + AES decrypt (chave: {slug}CIPHER$#)
- **Região:** Nacional (SP, RJ, SE, CE, BA)
- **Status:** 🟢 Rodando (215/425)
- **Empresas:** Chronomax, Norte MKT, Vega, Run Sports, Letape, Ponto Org, Maratona do Rio, Speed SE, All Running, De Castilho, +5

## CronosChip
- **URL:** https://cronoschip.com.br/resultados
- **Script:** scraper-cronoschip.cjs
- **Eventos:** 100
- **Região:** Bahia (Salvador, Feira de Santana)
- **Status:** ✅ Concluído — 39.632 resultados
- **Formato:** Wiclax CLAX/XML

## GlobalCronometragem
- **URL:** https://globalcronometragem.com.br/resultados
- **Script:** scraper-globalcronometragem.cjs
- **Eventos:** 74
- **Região:** SP interior
- **Status:** ✅ Concluído — 17.546 resultados
- **Formato:** PHP/HTML (Cheerio)

## SportsChrono
- **URL:** https://www.sportschrono.com.br/resultados-eventos
- **Script:** scraper-sportschrono.cjs
- **Eventos:** ~308
- **Região:** Sergipe
- **Status:** ✅ Coletado — 270.325 resultados
- **Formato:** CLAX XML

## Central de Resultados
- **URL:** https://centralderesultados.com.br/resultados
- **Script:** scraper-central-v3.cjs
- **Eventos:** ~660
- **Região:** Nordeste
- **Status:** ✅ Coletado — 25.759 resultados
- **Formato:** API POST JSON

## CronusTec
- **URL:** https://www.cronusteccorridas.com.br/resultados-eventos
- **Script:** scraper-cronustec.cjs
- **Eventos:** ~318
- **Região:** Bahia
- **Status:** ✅ Coletado — 8.901 resultados
- **Formato:** CLAX XML

## Race83
- **URL:** https://www.race83.com.br/new/resultados
- **Script:** race83-scraper-api.cjs
- **Eventos:** ~29
- **Região:** Nacional
- **Status:** ✅ Coletado — 7.890 resultados
- **Formato:** API JSON

---

## A Construir

### Contime
- **URL:** https://www.contime.com.br/category/resultados/
- **Status:** ⚠️ Redireciona para Central de Resultados (já coberto)

### ChipPower
- **URL:** https://www.chipower.com.br/resultados-eventos
- **Status:** 🔨 A construir — formato CLAX provável

### SportTimer
- **URL:** https://www.sporttimer.com.br/site/resultados_st.php
- **Status:** 🔨 A construir — PHP + AJAX (acao.php)

### CronosVale
- **URL:** https://www.cronosvale.com.br/resultados-eventos
- **Status:** 🔨 A construir — PHP custom

### ForChip
- **URL:** https://forchip.com.br/v5/resultados.php
- **Status:** 🔨 A construir — PHP + CLAX
