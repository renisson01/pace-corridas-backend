# REGENI — Roadmap Oficial

**Baseado em:** ARQUITETURA_OPERACIONAL_v3.1 (01/04/2026)

---

## 📊 Estado Atual

- ✅ **96 corridas, 72.813 resultados, 57.365 atletas**
- ✅ **ChipPower scraper** implementado (XML/CLAX parsing)
- ✅ **13 páginas frontend** ativas
- ✅ **IA Coach** funcional (Jack Daniels VDOT)
- ✅ **Analytics** em tempo real

---

## 🎯 Próximas Prioridades (Ordem)

### 🔴 ALTA — Próximos 30 dias

| # | Tarefa | Impacto | Tempo Est. |
|---|--------|--------|-----------|
| 1 | **Scraper RunningChip** | +50K atletas | 3 dias |
| 2 | **Scraper Chip4You** | +40K atletas | 2 dias |
| 3 | **Limpeza de dados** (telefones, tempos 00:00:00) | +15% qualidade | 2 dias |
| 4 | **SEO Generator** (páginas por atleta) | +500% Google traffic | 3 dias |
| 5 | **Monitor de eventos** (detecta automaticamente) | 24/7 coleta | 2 dias |

**Meta 30 dias:** 200+ corridas, 150K atletas

### 🟡 MÉDIA — 30-60 dias

| # | Tarefa | Impacto | Tempo Est. |
|---|--------|--------|-----------|
| 6 | **Scraper CBAT** (confederação oficial) | +100K atletas | 3 dias |
| 7 | **Ranking BR** (exibição correta no frontend) | +20% conversão | 2 dias |
| 8 | **Notificador** (avisa atleta novo resultado) | +engagement | 2 dias |
| 9 | **Visual polish** nas 13 páginas | +30% UX score | 3 dias |

**Meta 60 dias:** 500+ corridas, 300K atletas

### 🟢 BAIXA — 60-90 dias

| # | Tarefa | Impacto | Tempo Est. |
|---|--------|--------|-----------|
| 10 | **Buscador de corridas futuras** | +registros antecipados | 3 dias |
| 11 | **Simplificar atleta.html** (2700+ linhas) | Manutenibilidade | 2 dias |
| 12 | **Reativar OpenClaw** como orquestradora | Automatização completa | 5 dias |

**Meta 90 dias:** 1000+ corridas, 500K atletas (todo Brasil)

---

## 💡 Loop de Crescimento

```
Scraper importa corrida (RunningChip + Chip4You + CBAT)
         ↓
Atleta busca seu nome no Google
         ↓
Encontra REGENI (SEO Generator)
         ↓
Cria conta, compartilha
         ↓
Mais atletas encontram organicamente
         ↓
App tem 150K atletas em 30 dias
```

---

## 📋 Checklist Renisson

### Fase 1: Scrapers (30 dias)

- [ ] Implementar **RunningChip** (HTML tables + cheerio)
  - Teste em 5 eventos
  - Validar extração de campos
  - Deploy no production
  
- [ ] Implementar **Chip4You** (HTML tables com paginação)
  - Teste em 5 eventos
  - Rate limiting (1s entre requests)
  - Deploy no production
  
- [ ] **Limpeza de dados** no PostgreSQL
  - Remove telefones como distância
  - Normaliza nomes (caps consistency)
  - Corrige tempos 00:00:00 → DNS
  - Backup antes de alterações

### Fase 2: SEO + Frontend (30-60 dias)

- [ ] **SEO Generator**: cria página dinâmica por atleta
  - Estrutura: `/atleta/:id/name-slug`
  - Meta tags: nome, melhor tempo, estado, PR
  - Open Graph pra social sharing
  - Indexável no Google
  
- [ ] **Frontend polish**
  - Ranking BR exibindo dados corretos
  - Filtros por estado/distância
  - Performance (lazy load imagens)

### Fase 3: Automação (60-90 dias)

- [ ] **Monitor de eventos**: detecta novos eventos automaticamente
  - Checa RunningChip/Chip4You/CBAT 1x/dia
  - Avisa quando encontra novo
  - Auto-importa (validação humana opcionalmente)
  
- [ ] **Notificador**: atleta sabe quando resultado dele foi importado
  - Email ou WhatsApp
  - Link direto pro perfil
  
- [ ] **OpenClaw reativada** como orquestradora central

---

## 🚀 Deploy Automático

Cada scraper novo:

```bash
# 1. Criar em scripts/scraper-<sitename>.cjs
# 2. Testar em 5 eventos manually
node scripts/scraper-runningchip.cjs --test --limit=5

# 3. Validate results no banco
psql -c "SELECT COUNT(*) FROM Result WHERE createdAt > now() - interval '1 hour';"

# 4. Commit + push (com aprovação)
git add scripts/ && git commit -m "feat: RunningChip scraper"

# 5. Deploy
git push origin main
```

---

## 💰 Economia de Tokens (Crítica!)

| Tarefa | Modelo Atual | Modelo Otimizado | Economia |
|--------|-------------|-----------------|----------|
| Scrapers | (nenhum) | Node.js local | R$0 |
| Limpeza dados | (manual) | Node.js scripts | R$0 |
| Monitoramento | Polling contínuo | Cron 1x/dia | 95% |
| Notificações | (não existe) | Email simples | R$0.10 |
| SEO Generator | Opus (caro) | Haiku + templates | 95% |

**Custo total futuro:** ~R$0.50/semana (vs R$150 antes)

---

## ⚠️ Mandamentos Operacionais (8)

1. **Agentes NÃO decidem** — apenas executam e reportam ao Renisson
2. **Tudo é logado** — cada import, cada erro, cada decisão
3. **Execução limitada** — max 3 tentativas, max 10min por item
4. **Nunca push** sem autorização
5. **Nunca editar** index.js, schema.prisma sem validação
6. **Usar Haiku** (não Opus) para tudo que não exige reasoning complexo
7. **Rate limit:** 1s entre requests de scraping
8. **Backup** antes de qualquer migração destrutiva

---

## 🎬 Próximo Passo

**Ação imediata:** Autorizar implementação de **RunningChip scraper**

Estimativa:
- Código: 2 dias
- Testes: 1 dia
- Deploy: 1 dia
- Impacto: +50K atletas, +2M resultados

Procede? ✅

