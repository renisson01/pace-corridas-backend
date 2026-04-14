# REGENI — Mapa de Fontes de Resultados
> Atualizado: 14/Abril/2026 00:30
> Meta: 10 MILHÕES de resultados de CORRIDA DE RUA
> Regra: APENAS corrida de rua. Sem MTB, natação, trail, montanha.

---

## DOIS SISTEMAS DE COLETA

### 1. Coleta de RESULTADOS (histórico)
Pegar todos os resultados passados de todas as cronometradoras.
Filtro obrigatório: só corrida de rua (asfalto/pista).

### 2. Coleta de INSCRIÇÕES ABERTAS (futuro)
Pegar corridas com inscrição aberta para o calendário.
Fontes: mesmos sites + Sympla, Ticket Sports, MinhasInscrições.

---

## FONTES — PRIORIDADE POR VOLUME

### 🔴 TIER 1 — Gigantes (milhões de resultados)

| # | Fonte | URL | Volume | Método | Status REGENI |
|---|-------|-----|--------|--------|---------------|
| 1 | **Chronomax/Runking** | https://resultados.runking.com.br/ | 12M+ | RSC + AES decrypt | ✅ scraper-runking.cjs (parcial — precisa rodar mais agressivo) |
| 2 | **Yescom** | ASP.NET com login obrigatório | ~10M+ | Puppeteer + login | ❌ Nenhuma IA conseguiu quebrar. PRIORIDADE MÁXIMA |
| 3 | **ChipTiming** | https://eventos.chiptiming.com.br/resultados | Milhões | API JSON + JWT | 🔄 scraper-chiptiming.cjs (parcial — token JWT bloqueia) |

### 🟡 TIER 2 — Grandes (centenas de milhares)

| # | Fonte | URL | Método provável | Status REGENI |
|---|-------|-----|-----------------|---------------|
| 4 | **CronosVale** | https://www.cronosvale.com.br/resultados-eventos | CLAX/XML? | ❌ Novo |
| 5 | **CronosChip** | https://cronoschip.com.br/resultados | HTML/API? | ❌ Novo |
| 6 | **Central de Resultados** | https://centralderesultados.com.br/resultados | API POST | ✅ scraper-central-v3.cjs |
| 7 | **SportsChrono** | https://www.sportschrono.com.br/resultados-eventos | CLAX XML | ✅ scraper-sportschrono.cjs |
| 8 | **CronusTec** | https://www.cronusteccorridas.com.br/resultados-eventos | CLAX XML | ✅ scraper-cronustec.cjs |
| 9 | **RunnerBrasil** | https://www.runnerbrasil.com.br/Views/Runner/Runner_Resultados.aspx?idAno=2026 | ASP.NET HTML | ✅ scraper-corridas-brasil.cjs |
| 10 | **Race83** | https://www.race83.com.br/new/resultados | API JSON | ✅ race83-scraper-api.cjs |

### 🟢 TIER 3 — Médios (milhares a dezenas de milhares)

| # | Fonte | URL | Método provável | Status REGENI |
|---|-------|-----|-----------------|---------------|
| 11 | **GlobalCronometragem** | https://globalcronometragem.com.br/resultados | HTML? | ❌ Novo |
| 12 | **ZeniteEsportes** | https://www.zeniteesportes.com/resultados | HTML? | ❌ Novo |
| 13 | **Ativo** | https://www.ativo.com/eventosrealizados/ | HTML? | ❌ Novo |
| 14 | **ForChip** | https://forchip.com.br/v5/resultados.php | PHP/HTML | ❌ Novo |
| 15 | **Corridão** | https://www.corridao.com.br/welcome/resultados/2025.html | HTML estático | ❌ Novo |
| 16 | **CronoServ** | https://www.cronoserv.com.br/resultados | HTML? | ❌ Novo |
| 17 | **NewTimeCronometragem** | https://www.newtimecronometragem.com.br/resultados | HTML? | ❌ Novo |
| 18 | **BrasilCorrida** | https://brasilcorrida.com.br/#/resultados | SPA (Vue/React?) | ❌ Novo |
| 19 | **TimeCrono** | https://www.timecrono.com.br/resultados-eventos | CLAX? | ❌ Novo |
| 20 | **SportTimer** | https://www.sporttimer.com.br/site/resultados_st.php | PHP/HTML | ❌ Novo |
| 21 | **ACronoEsportes** | https://www.acronoesportes.com.br/resultados-eventos | CLAX? | ❌ Novo |
| 22 | **ChipVale** | https://www.chipvale.com.br/resultados | HTML? | ❌ Novo |
| 23 | **SouCorredor** | https://soucorredor.com.br/resultados | HTML? | ❌ Novo |
| 24 | **MinhasInscrições** | https://minhasinscricoes.com.br/pt-br/resultados | HTML? | ❌ Novo |
| 25 | **EsporteCorrida** | https://esportecorrida.com.br/v3/resultados.php | PHP + CLAX | ❌ Novo |
| 26 | **ChipRun** | https://chiprun.com.br/resultados/ | HTML? | ❌ Novo |
| 27 | **TriChip** | https://www.trichip.com.br/resultados-eventos-trichip | CLAX? | ❌ Novo |
| 28 | **Assessocor** | https://www.assessocor.online/resultados | HTML? | ❌ Novo |
| 29 | **Races.com.br** | https://www.races.com.br/#proximoseventos | SPA | ❌ Novo |
| 30 | **ChipBrasil/BRLive** | https://brlive.info + chipbrasil.com.br | Bubble.io (SPA) | ❌ Difícil |

---

## PADRÕES TÉCNICOS IDENTIFICADOS

### CLAX (XML)
Sites que usam o sistema CLAX/Wiclax para cronometragem. Formato XML padronizado.
**Já temos parser:** SportsChrono, CronusTec, Race83.
**Provavelmente CLAX:** TimeCrono, ACronoEsportes, TriChip, EsporteCorrida, CronosVale(?).
**Estratégia:** Reutilizar o parser CLAX existente, só mudar a URL base.

### ASP.NET
Sites Microsoft com ViewState, login.
**Exemplos:** Yescom, RunnerBrasil.
**Estratégia:** Puppeteer com cookies de sessão.

### SPA (JavaScript)
Sites que renderizam tudo no client.
**Exemplos:** BrasilCorrida, ChipBrasil/BRLive, Central de Resultados.
**Estratégia:** Puppeteer + interceptação de API.

### PHP/HTML estático
Sites tradicionais com HTML server-rendered.
**Exemplos:** ForChip, SportTimer, EsporteCorrida, Corridão.
**Estratégia:** Cheerio (mais rápido, mais estável).

---

## FILTRO: CORRIDA DE RUA APENAS

Muitos sites têm resultados mistos (MTB, trail, natação, montanha).
O scraper DEVE filtrar por:
- Palavras-chave INCLUIR: corrida, run, maratona, meia maratona, 5k, 10k, 15k, 21k, 42k, rua, asfalto
- Palavras-chave EXCLUIR: MTB, bike, ciclismo, natação, swim, trail, montanha, trilha, triathlon, duathlon, aquathlon, caminhada ecológica

---

## SISTEMA DE CONTROLE DE COLETA

Para cada fonte, manter registro de:
1. Último evento coletado (ID ou data)
2. Total de eventos disponíveis vs coletados
3. Total de resultados importados
4. Data da última coleta
5. Erros/bloqueios encontrados

Tabela proposta (futuro):
```sql
CREATE TABLE "ScrapeLog" (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,       -- 'chronomax', 'chiptiming', etc
  eventId TEXT,               -- ID do evento na fonte
  eventName TEXT,
  resultCount INT,
  status TEXT,                -- 'ok', 'error', 'blocked', 'skipped'
  errorMsg TEXT,
  createdAt TIMESTAMP DEFAULT NOW()
);
```

---

## FEATURE: EDIÇÃO PELO ATLETA

O corredor pode corrigir seus próprios resultados:
- Nome da prova
- Distância (km)
- Tempo
- Colocação geral / por gênero / faixa etária
- Cidade / Estado da prova
- Data da prova

Regras:
- Só pode editar resultados vinculados ao SEU perfil
- Edição fica marcada como `editedByAthlete: true`
- Dado original preservado em campo `originalData` (JSON)
- Se o scraper trouxer dado diferente depois, mostra conflito pro atleta resolver

---

## PRIORIDADE DE COLETA PARA 10M

| Prioridade | Fonte | Volume estimado | Esforço |
|------------|-------|-----------------|---------|
| 1 | Chronomax/Runking (rodar completo) | +5M | Baixo (scraper existe) |
| 2 | ChipTiming (resolver JWT) | +2M | Médio |
| 3 | Sites CLAX (reusar parser) | +500k | Baixo |
| 4 | Yescom (quebrar login) | +3M | Alto |
| 5 | PHP/HTML (Cheerio) | +200k | Baixo |
| 6 | SPAs (Puppeteer) | +100k | Médio |
