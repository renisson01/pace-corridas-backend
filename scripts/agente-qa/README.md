# 🎨 AGENTE-QA REGENI

Sistema de testes automáticos 24/7 com Playwright. Roda a cada 30min no Ubuntu, detecta erros antes do Renisson.

## O que testa
- 4 páginas em viewport mobile (390×844 — iPhone 14)
- Erros de console JS
- Elementos visíveis (nav, cards, textos)
- 4 endpoints de API (ranking, busca, corridas)
- Tempo de carregamento (threshold: 3s páginas, 2s APIs)
- Regressão visual por comparação de screenshots

## Setup (1 vez)
```bash
bash scripts/agente-qa/install.sh
```

## Executar manualmente
```bash
# Rodada única
node scripts/agente-qa/qa-runner.cjs --once

# Com logs detalhados
node scripts/agente-qa/qa-runner.cjs --once --verbose
```

## Ver resultados
```bash
cat cerebro/agentes/qa/dashboard.md         # Resumo visual
cat cerebro/agentes/qa/ultimo-relatorio.md  # Detalhes completos
ls cerebro/agentes/qa/tickets/              # Bugs encontrados
tail -f /tmp/regeni-qa/qa.log               # Logs do cron
```

## Arquivos
```
scripts/agente-qa/
├── qa-runner.cjs    ← script principal (Playwright)
├── qa-config.cjs    ← URLs, seletores, thresholds
├── qa-report.cjs    ← gera markdown no cerebro
├── install.sh       ← setup único
└── README.md        ← este arquivo

cerebro/agentes/qa/
├── dashboard.md          ← resumo atualizado a cada run
├── ultimo-relatorio.md   ← detalhes da última execução
└── tickets/QA-NNN.md     ← um arquivo por bug encontrado
```

## Screenshots
Ficam em `/tmp/regeni-qa/screenshots/` (apagados no reboot).
Baseline fica em `/tmp/regeni-qa/screenshots/baseline/` — se apagado, recria automaticamente na próxima execução.

## Tickets
- Criados automaticamente quando encontra bug novo
- Identificados por fingerprint (não cria duplicata)
- Para fechar: edite o ticket e mude `🔴 Aberto` para `✅ Resolvido`

## Manutenção
Adicionar novos checks em `qa-config.cjs` — seção `pages[].checks` ou `apiChecks`.

Tipos de check disponíveis:
- `text-exists` — verifica se texto existe no seletor
- `element-visible` — verifica se elemento está visível
- `element-count-min` — conta elementos, falha se abaixo do mínimo
- `no-console-errors` — falha se houver erros JS no console
- `api-responds` — chama endpoint e valida status HTTP
