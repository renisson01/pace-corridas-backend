# REGENI — Mapa Geral
> Backend do PACE Corridas · v3.0 · Railway + PostgreSQL
> Última atualização: 2026-04-13

---

## O que é

**REGENI** é o backend completo da plataforma PACE Corridas — plataforma brasileira de corrida de rua. Agrega resultados históricos de corridas, ranking nacional por distância, perfil de atleta, coach, IA, comunidades, GPS e loja.

---

## Notas do Cerebro

| Nota | Conteúdo |
|------|----------|
| [[CONTEXTO-TECNICO]] | **⭐ Ler primeiro** — Stack, scrapers, regras de ouro, Puppeteer |
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

# Coleta semanal manual
node scripts/coleta-semanal.cjs              # todas as fontes
node scripts/coleta-semanal.cjs --dry-run    # só visualizar
node scripts/coleta-semanal.cjs --fonte runking
node scripts/coleta-semanal.cjs --semanas 4  # janela maior
```

---

## Sistema de Coleta Semanal

> Cron: **todo domingo 12h** — `crontab -l` para verificar
> Log: `/tmp/coleta-semanal.log`

### Fontes disponíveis

| Fonte | Script | Região | Status |
|-------|--------|--------|--------|
| Central de Resultados | `scraper-central-v3.cjs` | Nordeste | ✅ Ativo |
| CronusTec | `scraper-cronustec.cjs` | Bahia | ✅ Ativo (manual) |
| SportsChrono/CLAX | `scraper-sportschrono.cjs` | Sergipe | ✅ Ativo |
| Contime | `importar-contime.cjs` | Via Central | ✅ Ativo (manual) |
| **Runking/Chronomax** | `scraper-runking.cjs` | Nacional (SP/RJ/SE) | ✅ **Novo** |
| Race83/CLAX | `race83-scraper-api.cjs` | Nacional | ✅ Ativo (manual) |
| RunnerBrasil | `scraper-corridas-brasil.cjs` | Nacional | ✅ Ativo (manual) |

### Fontes pendentes

| Fonte | Script | Região | Bloqueio |
|-------|--------|--------|---------|
| **Yescom** | `scraper-yescom.cjs` (stub) | SP, RS, CE | Login obrigatório (ASP.NET). Aguardar resultados Maratona SP 2026 no ChipTiming (`resultado.chiptiming.com.br`) em 24-48h. Solicitar parceria ou credenciais. |
| ChipTiming | `scraper-chiptiming.cjs` (parcial) | SP | API requer token JWT. Alternativa: aguardar versão pública. |
| CorridasBR | — | Nacional | Investigar API |
| Figueiredos | — | RN/Nordeste | Investigar API |
| O2Corre | — | Salvador/Floripa | Usa Runking (slug: `o2-correbrasil`) — **já coberto pelo scraper-runking** |

### Runking — Empresas cobertas automaticamente

O `scraper-runking.cjs` descobre eventos de **todos** os organizadores na plataforma Runking:
- Chronomax (SP/RJ)
- Speed Produções e Eventos (SE)
- Norte MKT / O2Corre Brasil (nacional)
- Maratona do Rio (RJ)
- Vega Sports (SP)
- Run Sports (SP)
- Ponto Org (nacional)
- Letape Brasil
- De Castilho (RJ)
- e outros

### Próximos passos para Yescom/Maratona SP

1. Verificar `resultado.chiptiming.com.br/evento/maratona-sp-2026` nas próximas 24-48h
2. Se disponível: adicionar slug em `scraper-yescom.cjs → EVENTOS_CONHECIDOS`
3. Para automação completa: solicitar token de API parceiro à Yescom
