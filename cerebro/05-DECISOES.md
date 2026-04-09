# Decisões Técnicas

← [[00-INDEX]]

> Registro de decisões arquiteturais com contexto e trade-offs.  
> Formato: O que foi decidido · Por que · Alternativas descartadas.

---

## DEC-001 — Fastify em vez de Express

**Decisão:** Usar Fastify como framework HTTP.

**Por quê:**
- Performance superior (~2x mais rápido que Express em benchmarks)
- Schema validation nativa
- Plugin system com encapsulamento
- Express está listado como dependência mas não é usado

**Trade-off:** Express tem ecossistema maior. Fastify tem menos exemplos online.

**Consequência prática:** Todo route handler segue o padrão:
```js
export async function xRoutes(fastify) {
  fastify.get('/rota', async (req, reply) => { ... });
}
await app.register(xRoutes);
```

---

## DEC-002 — ESM (`"type": "module"`) no backend

**Decisão:** Código `src/` usa `import`/`export` (ESM), não `require` (CommonJS).

**Por quê:** Modernização, melhor tree-shaking, alinhamento com o ecossistema Node moderno.

**Exceção:** Scripts standalone em `scripts/` usam `.cjs` extension e `require()` porque são executados diretamente com `node` sem bundler e algumas dependências deles não suportam ESM puro.

**Regra:** Nunca misturar — `src/` é sempre ESM, `scripts/` é sempre CJS.

---

## DEC-003 — Frontend como HTML estático servido pelo mesmo servidor

**Decisão:** Sem framework frontend (React/Vue/Next). HTML puro em `public/`, servido pelo Fastify com cache em memória.

**Por quê:**
- Zero overhead de build pipeline
- Deploy simplíssimo (um único servidor Railway)
- PWA funciona nativamente
- Controle total do HTML

**Trade-off:** Sem reatividade, state management manual, duplicação de lógica JS.

**Consequência:** Cada página é um HTML independente. Lógica compartilhada (utils, auth check) é duplicada ou inline. As páginas são carregadas em memória no boot (`htmlCache`) para evitar I/O em cada request, com header `Cache-Control: no-store` para forçar sempre a versão mais recente.

---

## DEC-004 — Dois sistemas de autenticação

**Decisão:** Manter o legacy `authMiddleware` (base64url) e o novo JWT em coexistência.

**Por quê:** Migração incremental. Módulos antigos usam o middleware legacy; módulos novos usam JWT diretamente em `auth.routes.js`.

**Trade-off:** Dois sistemas para manter, confuso para novos devs.

**Status:** Legacy ainda presente, não foi migrado completamente para JWT.

**Regra:** Novos módulos sempre usam JWT. Não usar o middleware legacy em código novo.

---

## DEC-005 — Prisma singleton em `src/lib/prisma.js`

**Decisão:** Um único `PrismaClient` importado de `src/lib/prisma.js`.

**Por quê:** Evitar connection pool exhaustion. Prisma abre um pool de conexões por instância; múltiplas instâncias explodem o limite do PostgreSQL do Railway.

**Exceção:** Scripts `.cjs` em `scripts/` criam sua própria instância local (ok porque são processos efêmeros, não o servidor).

**Regra crítica:** Nunca `new PrismaClient()` dentro de `src/`. Sempre `import prisma from '../../lib/prisma.js'`.

---

## DEC-006 — `time` armazenado como String

**Decisão:** O campo `Result.time` é `String`, não `Int` (segundos) nem `DateTime`.

**Por quê:** Scrapers trazem o tempo já formatado ("45:23", "1:05:30"). Converter para segundos requereria normalizar todos os formatos inconsistentes dos sites fontes.

**Trade-off:** Ordenação por tempo usa `ORDER BY time ASC` que funciona lexicograficamente — só funciona corretamente se todos os tempos tiverem o mesmo número de partes (HH:MM:SS). Tempos "MM:SS" e "HH:MM:SS" misturados causam ordenação errada.

**Consequência (BUG-001):** O ranking-raw.js usa `localeCompare` para ordenar, que também pode falhar em formatos mistos.

**Solução ideal futura:** Normalizar `time` para sempre `HH:MM:SS` na importação.

---

## DEC-007 — Deduplicação de corridas por `(nome + data + cidade)`

**Decisão:** `scraper.service.js` deduplica corridas usando combinação normalizada de nome + data + cidade.

**Por quê:** Múltiplos scrapers podem encontrar a mesma corrida. Sem dedup, teríamos duplicatas.

**Normalização:** Nome é lowercased, acentos removidos, espaços normalizados.

**Trade-off:** Corridas com mesmo nome na mesma cidade no mesmo dia (muito raro) seriam tratadas como a mesma.

---

## DEC-008 — 21 pontos fixos por corrida

**Decisão:** Cada `Result` vale 21 pontos para o atleta, independente de posição, distância ou tempo.

**Por quê (número 21):** Maratona tem 42km — metade é 21. Referência à meia maratona como "unidade base" do corredor.

**Trade-off:** Não diferencia elite de participante. Um corredor que termina em último recebe os mesmos pontos que o primeiro.

**Recálculo:** Agente 3 recalcula diariamente: `totalPoints = count(results) × 21`.

**Futuro:** Sistema de pontos pode ser refinado por posição percentual (top 10% = mais pontos).

---

## DEC-009 — Protocolo Cobaia como feature separada

**Decisão:** O "Protocolo Cobaia" (experimento pessoal de performance do Renisson) tem modelos próprios no schema e módulo dedicado em vez de ser embutido no perfil do usuário.

**Por quê:** É um conjunto de dados muito específico (HRV, gordura%, sauna, exames de sangue) que não faz sentido para todos os usuários. Separar mantém o modelo `User` limpo e permite evoluir o protocolo independentemente.

---

## DEC-010 — SQL direto no ranking (`ranking-raw.js`)

**Decisão:** O ranking geral por distância usa `prisma.$queryRawUnsafe()` com SQL raw em vez de `prisma.findMany()`.

**Por quê:** A query usa `DISTINCT ON (a.id)` + `ORDER BY a.id, r.time ASC` que é idioma PostgreSQL sem equivalente direto no Prisma ORM. SQL raw é mais legível e eficiente aqui.

**Risco:** `$queryRawUnsafe` é vulnerável a SQL injection se `$1` não for sanitizado. Os parâmetros são strings controladas internamente (`'10K'`, `'M'`, `'F'`) — nunca input direto do usuário.

**Regra:** Nunca passar query params do usuário direto para `$queryRawUnsafe`. Sempre validar primeiro.

---

## DEC-011 — Scraper em 3 tiers

**Decisão:** Arquitetura de scraping em 3 camadas por complexidade do site alvo.

| Tier | Ferramenta | Quando usar |
|------|-----------|-------------|
| 1 | Cheerio | HTML estático, resposta rápida |
| 2 | Puppeteer | SPA/JavaScript rendered |
| 3 | JSON API | Sites com endpoint público de dados |

**Por quê:** Puppeteer é pesado (Chrome headless) — só usar quando necessário. Cheerio é leve e suficiente para a maioria dos sites de cronometragem.

**Rate limit:** 1 segundo entre requests para não ser bloqueado.
