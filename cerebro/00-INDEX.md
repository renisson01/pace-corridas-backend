# REGENI — Mapa Geral
> Backend do PACE Corridas · v3.0 · Railway + PostgreSQL
> Última atualização: 2026-04-09

---

## O que é

**REGENI** é o backend completo da plataforma PACE Corridas — plataforma brasileira de corrida de rua. Agrega resultados históricos de corridas, ranking nacional por distância, perfil de atleta, coach, IA, comunidades, GPS e loja.

---

## Notas do Cerebro

| Nota | Conteúdo |
|------|----------|
| [[01-ARQUITETURA]] | Stack, boot sequence, módulos, rotas, agentes cron |
| [[02-BANCO-DE-DADOS]] | Todos os modelos Prisma com campos e relações |
| [[03-BUGS-RESOLVIDOS]] | Bugs corrigidos com causa raiz e solução |
| [[04-ROADMAP]] | Próximas features por prioridade |
| [[05-DECISOES]] | Decisões técnicas tomadas e o porquê |

---

## Estrutura de Pastas

```
pace-corridas-backend/
├── src/
│   ├── index.js              ← entry point, registra tudo
│   ├── agents/index.js       ← 9 cron agents
│   ├── lib/prisma.js         ← singleton PrismaClient
│   ├── middlewares/          ← authMiddleware (legacy base64url)
│   └── modules/              ← 30 módulos de feature
├── prisma/
│   └── schema.prisma         ← 35+ modelos
├── public/                   ← 30 páginas HTML (PWA)
├── scripts/                  ← scrapers .cjs standalone
└── _cerebro/                 ← este vault Obsidian
```

---

## Deploy

- **Plataforma:** Railway
- **DB:** PostgreSQL (Railway managed)
- **Porta:** `process.env.PORT || 3000`
- **Start:** `npx prisma generate && npx prisma db push && node src/index.js`

## Env Vars obrigatórias

| Variável | Uso |
|----------|-----|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Assinar tokens JWT (30d) |
| `ADMIN_KEY` | Rotas admin protegidas |
| `ANTHROPIC_API_KEY` | IA Coach (Claude) |
| `MP_ACCESS_TOKEN` | MercadoPago pagamentos |
| `STRAVA_CLIENT_ID` | OAuth Strava |
| `STRAVA_CLIENT_SECRET` | OAuth Strava |

---

## Comandos rápidos

```bash
npm run dev          # hot reload
npm start            # produção
npx prisma studio    # GUI banco
docker compose up -d # PostgreSQL local
node scripts/XXX.cjs # rodar scraper avulso
```
