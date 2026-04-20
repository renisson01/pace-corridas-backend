# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**REGENI** (v3.0) is the backend for PACE Corridas — a Brazilian running platform. It tracks races (corridas), athletes (atletas), results, rankings, communities, GPS activities, and AI coaching. The app is deployed on Railway with a PostgreSQL database.

## Commands

```bash
# Development
npm run dev          # Start with hot reload (node --watch src/index.js)

# Production (used by Railway)
npm start            # Generates Prisma client, pushes schema, starts server

# Scraping
npm run scraper      # Run manual scraper

# Seeds
npm run seed:cbat    # Seed CBAT ranking data

# Database (run directly)
npx prisma generate           # Regenerate Prisma client after schema changes
npx prisma db push            # Push schema changes to database
npx prisma studio             # Open Prisma Studio GUI

# Local database (Docker)
docker compose up -d          # Start PostgreSQL locally
```

There are no automated tests in this project.

## Architecture

### Framework & Runtime
- **Fastify** (not Express, though Express is listed as a dependency) as the HTTP framework
- **ESM modules** (`"type": "module"` in package.json) — use `import`/`export`, not `require`
- **Prisma ORM** with PostgreSQL
- **node-cron** for scheduled background agents
- Deployed to Railway; env vars: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_KEY`, `ANTHROPIC_API_KEY`, `MP_ACCESS_TOKEN`

### Entry Point & Boot Sequence (`src/index.js`)
1. Loads `.env` only when not on Railway
2. Imports and starts all cron agents (`src/agents/index.js`)
3. Creates Fastify app with CORS, multipart, rate-limit plugins
4. Pre-loads all HTML pages from `public/` into an in-memory cache (no-store headers)
5. Registers all route modules

### Module Structure (`src/modules/`)
Each feature is a self-contained module with a `*.routes.js` file (and sometimes `*.service.js`):
- `auth` — register/login, JWT (30d expiry), BIP39 recovery phrase
- `races` — Race CRUD
- `results` — athlete results, import from scrapers
- `ranking` — points calculation (21 pts/race) and ranking display
- `scraper` — web scraping engine (Tier 1: Cheerio/HTML, Tier 2: Puppeteer/SPA, Tier 3: JSON APIs)
- `corridas-abertas` — upcoming open races (CorridaAberta model)
- `comunidade` — communities with messaging, training schedules, check-ins
- `coach` — coach profiles and coach-athlete relationships
- `ia` — AI coach using Claude API (ANTHROPIC_API_KEY)
- `decision` — Decision Engine for daily personalized recommendations
- `cobaia` — "guinea pig" protocol: daily check-ins, food logs, sauna, lab exams
- `biological/bioage` — biological age calculation
- `gps` — GPS activity tracking (supports Strava sync via `integracoes`)
- `loja` — merchandise store with MercadoPago payments
- `pagamentos` — payment processing
- `organizer` — race organizer requests
- `analytics`, `social`, `passport`, `subscription`, `league`, `prediction`, `agegroups`, `upload`, `amigo-pace`, `assessoria`

### Database Models (Prisma)
Key models and their relationships:
- `User` ↔ `Athlete` (1:1 optional, linked via `athleteId`)
- `Athlete` → `Result[]` — race results belong to athletes
- `Race` → `Result[]` — results belong to races
- `User` → many social/community models (Follow, Like, Post, Comunidade, etc.)
- `CorridaAberta` — upcoming open races (separate from `Race` which stores past races with results)
- `CoachProfile` → `CoachAtleta[]` → `User` (coach manages athletes)

### Authentication
Two auth systems in use:
1. **`src/middlewares/authMiddleware.js`** — simple base64url token (legacy, used in some routes)
2. **JWT via jsonwebtoken** — used in `auth.routes.js`, 30-day expiry, secret `JWT_SECRET || 'pace-secret-2026'`

Routes check auth via `preHandler: [authMiddleware]` on Fastify route definitions.

### Background Agents (`src/agents/index.js`)
12 cron agents run automatically on startup:
- Strava sync (daily 3h)
- Ranking recalculation (daily 4h)
- Premium expiry check (daily 9h)
- Scraper execution (Sun+Wed 6h)
- Health monitoring, nutrition analysis, coach daily plans, etc.

### Scraper Architecture (`src/modules/scraper/`)
- `scraper.service.js` — central deduplication engine; races are deduplicated by `(normalized_name + date + city)`
- `scraper.routes.js` — manual trigger via `/scraper/executar`
- `scraper-auto.routes.js` — automated scraping routes
- Individual scrapers in `scripts/` for specific sites (ChipPower, Race83, SportsChrono, etc.)
- Scraper scripts in `scripts/` are standalone `.cjs` files (CommonJS, run directly with `node`)

### Frontend
Static HTML files in `public/` are served by the same Fastify server (no separate frontend server). Pages are loaded into memory at startup. The app is a PWA (`manifest.json`, `sw.js`).

## Operational Mandates (from ROADMAP.md)

1. Agents only execute and report — Renisson decides
2. Everything logged
3. Max 3 retries, max 10min per operation
4. **Never push** without authorization
5. **Never edit** `src/index.js` or `prisma/schema.prisma` without validation
6. Use Haiku (not Opus) for non-complex AI tasks
7. Rate limit: 1s between scraping requests
8. Backup before any destructive migration

## Key Conventions

- Standalone scripts in `scripts/` use `.cjs` extension (CommonJS) and can be run directly with `node`
- Main `src/` code uses ESM (`import`/`export`)
- Prisma singleton is in `src/lib/prisma.js` — import this, don't create new `PrismaClient` instances (except in scripts)
- All routes follow the Fastify plugin pattern: `export async function xyzRoutes(fastify) { fastify.get(...) }`
- Brazilian Portuguese is used throughout (variable names, comments, user-facing strings)
- Database fields use Portuguese names (`nome`, `data`, `cidade`, `estado`, `criadoEm`)

## Permissões Automáticas

O fundador NÃO é programador. Ele não deve precisar aprovar comandos no terminal.

### PERMITIDO SEM PERGUNTAR:
- git add, commit, push
- npm install
- Criar/editar qualquer arquivo em scripts/, public/, cerebro/
- Rodar scrapers (node scripts/scraper-*.cjs)
- Rodar testes (node scripts/agente-qa/*)
- Consultas SQL SELECT
- curl para APIs externas
- Criar/editar cron

### PRECISA AUTORIZAÇÃO DO FUNDADOR (via Claude Opus):
- Editar src/ (código core do servidor)
- Editar schema.prisma
- Editar rotas de pagamento
- DELETE ou DROP em SQL
- Alterar variáveis de ambiente em produção
