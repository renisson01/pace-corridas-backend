# Arquitetura — REGENI v3.0

← [[00-INDEX]]

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js (ESM — `"type": "module"`) |
| Framework HTTP | **Fastify** v4 (Express está no package.json mas não é usado) |
| ORM | **Prisma** v6 + PostgreSQL |
| Autenticação | JWT (jsonwebtoken, 30d) + legacy base64url |
| Scraping | Cheerio (Tier 1) · Puppeteer (Tier 2) · JSON API (Tier 3) |
| IA | Claude API via `@anthropic-ai/sdk` (ANTHROPIC_API_KEY) |
| Pagamentos | MercadoPago SDK |
| Upload | Cloudinary |
| Agendamento | node-cron |
| Deploy | Railway |

---

## Boot Sequence (`src/index.js`)

1. Carrega `.env` se não estiver no Railway
2. Importa e inicia todos os agentes cron (`src/agents/index.js`)
3. Cria instância Fastify com plugins: `@fastify/cors`, `@fastify/multipart`, `@fastify/rate-limit`
4. Pré-carrega todas as páginas HTML de `public/` em memória (`htmlCache`)
5. Registra os 25+ módulos de rotas
6. Guard hook para `/treinador.html` — rejeita não-coaches com 403

**Rate limit:** 100 req/min por IP

---

## Módulos (`src/modules/`)

### Core de corridas
| Módulo | Arquivo | Responsabilidade |
|--------|---------|-----------------|
| `auth` | `auth.routes.js` | Register/login, JWT, BIP39 recovery phrase |
| `races` | `races.routes.js` | CRUD de Race (corridas passadas com resultados) |
| `results` | `results.routes.js` | Import e listagem de resultados de atletas |
| `ranking` | `ranking.routes.js` + `ranking-raw.js` | Ranking por distância/prova, SQL direto |
| `scraper` | `scraper.routes.js` + `scraper.service.js` | Engine de scraping + deduplicação |
| `corridas-abertas` | `corridas.routes.js` | Corridas futuras/inscrições abertas |

### Perfil e social
| Módulo | Responsabilidade |
|--------|-----------------|
| `auth` | User registration, login, perfil |
| `social` | Follow, likes, posts, comments |
| `amigo-pace` | Sistema de amigos (request/accept) |
| `comunidade` | Comunidades, mensagens, treinos, check-ins, mural |
| `coach` | CoachProfile, CoachAtleta, planos |
| `gps` | AtividadeGPS, sync Strava |
| `integracoes` | OAuth Strava/Garmin/Polar |

### Saúde e IA
| Módulo | Responsabilidade |
|--------|-----------------|
| `ia` | Chat com Claude (AI coach), IaConversa, IaPerfilCorredor |
| `decision` | Decision Engine — plano diário personalizado |
| `cobaia` | Protocolo cobaia: diário, alimentação, sauna, exames, agenda |
| `biological/bioage` | Cálculo de idade biológica (BioAgeRecord, RodaVida) |

### Negócio
| Módulo | Responsabilidade |
|--------|-----------------|
| `loja` | Produtos, variantes, pedidos (MercadoPago) |
| `pagamentos` | Registro de pagamentos, webhooks MP |
| `subscription` | CoachSubscription (planos coach) |
| `organizer` | Solicitações de organizadores de corrida |
| `admin` | Rotas administrativas (ADMIN_KEY) |
| `upload` | Upload de fotos via Cloudinary |

### Outros
| Módulo | Responsabilidade |
|--------|-----------------|
| `analytics` | Métricas de uso |
| `agegroups` | Scraper CBAT, ranking por faixa etária |
| `league` | Ligas entre atletas |
| `prediction` | Predição de tempo por distância |
| `passport` | "Passaporte do corredor" (histórico de corridas) |
| `assessoria` | Assessorias de corrida parceiras |

---

## Rotas principais

### Autenticação
```
POST /auth/register
POST /auth/login
GET  /auth/me
POST /auth/recovery
```

### Ranking
```
GET /ranking/10km?genero=M
GET /ranking/5km
GET /ranking/21km
GET /ranking/42km
GET /ranking/prova/:raceId?distance=10K&genero=F
GET /ranking/stats
GET /provas               ← lista corridas com resultados
GET /corrida/:id/distancias
GET /corrida/:id/resultados
```

### Atletas
```
GET /atleta/:id           ← perfil + provas + melhores por dist
GET /buscar-atletas?nome=
```

### Corridas abertas
```
GET  /corridas-abertas
POST /corridas-abertas    ← admin
```

### IA
```
POST /ia/chat
GET  /ia/perfil
POST /ia/perfil
```

### GPS / Strava
```
GET  /gps/atividades
POST /gps/atividade
GET  /integracoes/strava/connect
GET  /integracoes/strava/callback
```

### Comunidade
```
GET  /comunidades
POST /comunidades
GET  /comunidades/:slug
POST /comunidades/:id/entrar
POST /comunidades/:id/mensagem
GET  /comunidades/:id/treinos
```

---

## Agentes Cron (`src/agents/index.js`)

| # | Nome | Schedule | O que faz |
|---|------|----------|-----------|
| 1 | SCRAPER | via corridas.routes.js | Scraping de corridas |
| 2 | STRAVA | `0 3 * * *` (3h diário) | Sync atividades Strava de todos os usuários |
| 3 | RANKING | `0 4 * * *` (4h diário) | Recalcula `totalPoints` e `totalRaces` de todos os atletas (21 pts/corrida) |
| 4 | NOTIF | `0 8 * * *` (8h diário) | Log corridas nos próximos 7 dias (push futuro) |
| 5 | IA_DICA | `0 7 * * *` (7h diário) | Dica do dia rotativa (5 dicas) |
| 6 | PREMIUM | `0 9 * * *` (9h diário) | Desativa premium expirados, loga os vencendo em 3 dias |
| 7 | RESULTADOS | `0 5 * * 1` (5h seg) | Placeholder para scraper de resultados |
| 8 | COACH | `0 6 * * *` (6h diário) | Loga atletas premium sem checkin |
| 9 | SAUDE | `0 10 * * *` (10h diário) | Alerta gordura < 5%, inativos há 3 dias |

---

## Frontend (PWA)

Páginas HTML estáticas servidas pelo mesmo Fastify, carregadas em memória no boot.

| Página | Rota |
|--------|------|
| `index.html` | `/` |
| `entrar.html` | Login/register |
| `perfil.html` | Perfil do usuário logado |
| `perfil-atleta.html` | Perfil público de qualquer atleta |
| `resultados.html` | Ranking + resultados por prova |
| `corridas-abertas.html` | Calendário de corridas futuras |
| `ia.html` | Chat com AI Coach |
| `gps.html` | Atividades GPS |
| `cobaia.html` | Protocolo cobaia diário |
| `treinador.html` | Dashboard do coach (guard: isCoach) |
| `comunidades.html` | Lista de comunidades |
| `loja.html` | Loja de produtos |
| `calculadoras.html` | Calculadoras de pace/VO2/etc |

---

## Autenticação (dois sistemas)

### JWT (principal, novos módulos)
- Gerado em `POST /auth/login`
- Payload: `{ userId, email, name }`
- Expiração: 30 dias
- Secret: `JWT_SECRET || 'pace-secret-2026'`
- Cookie: `pace_token`

### Legacy base64url (authMiddleware)
- Token simples em base64
- Usado em rotas antigas
- `src/middlewares/authMiddleware.js`

---

## Scraper Architecture

```
Tier 1 (Cheerio/HTML)   → sites com HTML estático
Tier 2 (Puppeteer/SPA)  → sites JavaScript rendered
Tier 3 (JSON API)       → endpoints diretos dos cronômetros
```

**Deduplicação** (`scraper.service.js`): normaliza nome da corrida + data + cidade.  
**Sites suportados:** ChipPower, Race83, SportsChrono, ChipTiming, CRONOtag, SuperCrono.  
**Scripts standalone:** `scripts/*.cjs` (CommonJS, `node scripts/xxx.cjs`)
