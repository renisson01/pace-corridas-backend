# Roadmap — REGENI v3.0

← [[00-INDEX]]

> Prioridades baseadas no impacto para usuário e viabilidade técnica.  
> Atualizado em: 2026-04-09

---

## Status dos módulos atuais

| Módulo | Status | Notas |
|--------|--------|-------|
| Ranking por distância | ✅ Pronto | Funciona, bugs de exibição corrigidos |
| Resultados por prova | ✅ Pronto | Multi-distância com pace correto |
| Auth JWT | ✅ Pronto | Login/register/recovery BIP39 |
| Corridas abertas | ✅ Pronto | Calendário com scraper |
| Perfil do atleta | ✅ Pronto | Público + privado logado |
| GPS / Strava | ✅ Pronto | Sync automático 3h diário |
| IA Coach (Claude) | ✅ Pronto | Chat + perfil psicológico/biológico |
| Decision Engine | ✅ Pronto | Plano diário com DecisionLog |
| Comunidades | ✅ Pronto | Mensagens, treinos estruturados, check-in |
| Cobaia Protocol | ✅ Pronto | Diário, alimentação, sauna, exames |
| Loja + MercadoPago | ✅ Pronto | Produtos, variantes, checkout |
| Coach Dashboard | ✅ Pronto | Guard isCoach, gestão de atletas |
| Passaporte | 🔄 Parcial | Estrutura criada |
| Ligas | 🔄 Parcial | Schema criado, lógica pendente |
| Scraper de resultados | 🔄 Parcial | Agente 7 placeholder — só log |
| Push notifications | ⏳ Pendente | Agentes 4/6 logam mas não enviam |
| Email (nodemailer) | ⏳ Pendente | Dependência instalada, não configurada |

---

## Prioridade Alta

### P1 — Push Notifications
**Por quê:** Agentes 4 (corridas próximas) e 6 (premium vencendo) já detectam os eventos, mas não enviam nada.  
**O que fazer:**
- Configurar `nodemailer` para envio de email (Railway SMTP ou Resend)
- Ou implementar Web Push via `web-push` para PWA
- Tabela `NotificacaoPush` com `userId`, `tipo`, `enviado`, `criadoEm`

### P2 — Scraper de Resultados (Agente 7)
**Por quê:** O maior gap — temos corridas no calendário mas não importamos automaticamente os resultados.  
**O que fazer:**
- Completar o Agente 7 (`0 5 * * 1`) com scraping real
- Sites prioritários: ChipPower, CRONOtag, SportsChrono
- Linkar resultados scrapeados com `CorridaAberta` → criar `Race` → importar `Result[]`

### P3 — Verificação de Email
**Por quê:** Campo `emailVerified` existe no User mas nada o verifica.  
**O que fazer:**
- Enviar email com `verifyToken` no registro
- Rota `GET /auth/verify/:token`
- Bloquear algumas funcionalidades para não-verificados

### P4 — Página de Perfil do Atleta — vincular User ↔ Athlete
**Por quê:** User e Athlete são entidades separadas. Um usuário registrado precisa se vincular ao seu registro histórico de corredor.  
**O que fazer:**
- UI em `perfil.html` para buscar e confirmar seu `Athlete`
- Rota `POST /auth/vincular-atleta` com validação (nome + estado + prova)

---

## Prioridade Média

### P5 — Ligas entre atletas
**Schema:** `League` criado, rotas parciais em `league.routes.js`  
**O que fazer:** Lógica de pontuação, convite, ranking de liga semanal/mensal

### P6 — Página de Resultados — aba "Faixas Etárias"
**Status:** Rota `/corrida/:id/faixas` existe, falta UI no `resultados.html`

### P7 — Calculadoras avançadas
**Página:** `calculadoras.html` existe  
**O que fazer:** VDOT, predição de pace por distância, zonas de FC

### P8 — Export de dados
**O que fazer:** CSV/PDF do ranking, resultados de uma prova

### P9 — Helmet (segurança HTTP)
**Status:** `@fastify/helmet` instalado mas comentado em `src/index.js`  
**Por quê comentado:** Provavelmente conflito com CSP em PWA  
**O que fazer:** Configurar CSP adequado e reativar

---

## Prioridade Baixa

### P10 — Testes automatizados
**Status:** Não existem. O CLAUDE.md confirma: "There are no automated tests".  
**O que fazer:** Pelo menos testes de integração para rotas críticas de ranking e auth

### P11 — Garmin / Polar OAuth
**Schema:** `IntegracaoToken` suporta `provider: garmin | polar`  
**Status:** Strava funciona, Garmin/Polar não implementados

### P12 — Assessorias CRUD
**Schema:** `Assessoria` existe, sem UI de cadastro público

### P13 — Admin dashboard
**Página:** `admin-pedidos.html` existe para pedidos  
**O que fazer:** Dashboard unificado com stats de usuários, corridas, scraper

---

## Mandatos operacionais (não mudar)

1. Agentes só executam e reportam — Renisson decide
2. Tudo logado
3. Max 3 retries, max 10min por operação
4. **Nunca push** sem autorização
5. **Nunca editar** `src/index.js` ou `prisma/schema.prisma` sem validação prévia
6. Usar Haiku (não Opus) para tarefas IA simples
7. Rate limit: 1s entre requests de scraping
8. Backup antes de qualquer migração destrutiva
