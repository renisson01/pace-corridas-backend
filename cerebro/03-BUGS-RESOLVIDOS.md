# Bugs Resolvidos

← [[00-INDEX]]

> Registro de bugs encontrados e corrigidos, com causa raiz e solução.  
> Última atualização: 2026-04-10

---

## 2026-04-10

**Status do dia:** Sem novos bugs registrados. Todos os bugs críticos de ranking e resultados estão resolvidos. Arquivos de diagnóstico/scraper experimentais acumulados na raiz (não comitados) — ver 04-ROADMAP para organização pendente.

---

## 2026-04-09

---

### BUG-001 — Ranking retornava 0 atletas (mismatch de distância)
**Commit:** `82842d5`  
**Arquivo:** `src/modules/ranking/ranking-raw.js`

**Sintoma:** `/ranking/10km` retornava array vazio mesmo com resultados no banco.

**Causa raiz:** A query SQL comparava `r.distance` diretamente com `'10K'`, mas o banco armazenava distâncias em formatos variados: `"10km"`, `"10K"`, `"10 km"`, `"10KM"`. O `WHERE r.distance = $1` com `$1 = '10K'` não casava com `"10km"`.

**Solução:** Normalizar ambos os lados antes da comparação:
```sql
WHERE REPLACE(UPPER(r.distance), 'KM', 'K') = $1
```
O parâmetro `$1` já chega normalizado como `'10K'`, `'5K'`, etc.

---

### BUG-002 — Tempo exibido como `00:23:33` em vez de `23:33`
**Commit:** `afd9ce2`  
**Arquivo:** `public/resultados.html`

**Sintoma:** Tempos de corridas sub-1-hora apareciam com o prefixo de horas zerado: `00:23:33`, `00:45:12`, etc.

**Causa raiz:** O campo `time` é armazenado no banco em formato `HH:MM:SS` (3 partes). O frontend renderizava o valor bruto sem tratamento. A função `fmtT` no mini-stats já fazia isso corretamente, mas o `renderTable` e `openAthleteSheet` não.

**Solução:** Adicionada função `formatTime(t)`:
```js
function formatTime(t) {
  if (!t || t === '—') return t;
  return t.replace(/^00:/, ''); // "00:23:33" → "23:33"
}
```
Aplicada em: tabela principal, sheet do atleta, provas no sheet, cards de equipes.

---

### BUG-003 — Pace absurdo (`2:21/km`) em resultados multi-distância
**Commit:** `afd9ce2`  
**Arquivo:** `public/resultados.html`

**Sintoma:** Ao visualizar resultados de uma prova sem filtrar por distância, atletas de 5km mostravam paces impossíveis (ex: `2:21/km`).

**Causa raiz:** A função `buscarPorProva` usava `distKm = 10` como fallback quando nenhuma distância era selecionada. O `renderTable` recebia esse `km` fixo e o aplicava a **todas** as linhas, independente de qual distância cada atleta havia corrido. Um atleta de 5km com tempo `23:33` dividia por `10` em vez de `5`, gerando pace incorreto.

**Solução:** Adicionada `extrairKm(distStr)` no frontend (igual à do backend) e uso de `rowKm` por linha:
```js
function extrairKm(distStr) {
  if (!distStr) return null;
  const m = distStr.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

// Em renderTable:
const rowKm = extrairKm(r.distance) || km;
// rowKm prioriza r.distance (campo por atleta) e cai no km do contexto
```
O backend já retorna `distance` por linha em `getRankingByRace`, então o fix foi 100% no frontend.

---

### BUG-004 — `/auth/me` retornava dados errados
**Commit:** `f67e4c8`  
**Arquivo:** Frontend (`perfil.html`)

**Sintoma:** Perfil do usuário não carregava — `athleteId` aparecia como undefined.

**Causa raiz:** Frontend acessava `userData.name` diretamente quando a API retorna `{ user: { ... } }`. Estrutura: `data.user.name`, não `data.name`.

**Solução:** Corrigir parsing: `const user = data.user` em vez de `const user = data`.

---

### BUG-005 — Scraper Race83 não parsava eventos corretamente
**Commit:** `107b552`  
**Arquivo:** `scripts/race83-scraper-api.cjs`

**Sintoma:** Scraper não encontrava corridas no Race83.

**Causa raiz:** O HTML do Race83 usa tags `<E>` (não `<Concurrent>`) para listagem de eventos. O seletor Cheerio estava errado.

**Solução:** Corrigido seletor para parsear as tags corretas do HTML do Race83.

---

### BUG-006 — PDF importer dependia de `DOMMatrix` (não disponível no Node)
**Commit:** `c93ff6f`  
**Arquivo:** Script de importação de PDF

**Sintoma:** Erro `DOMMatrix is not defined` ao rodar o importador de PDF de resultados.

**Causa raiz:** `pdfjs-dist` usa APIs do browser (`DOMMatrix`) que não existem no Node.js.

**Solução:** Substituído por `pdftotext` (ferramenta CLI do sistema) que converte PDF → texto sem dependências de browser.

---

## Template para novos bugs

```markdown
### BUG-XXX — Título
**Commit:** `hash`  
**Arquivo:** `caminho/do/arquivo`

**Sintoma:** O que o usuário via.

**Causa raiz:** Por que acontecia.

**Solução:** O que foi mudado (com snippet se relevante).
```
