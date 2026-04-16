# 🤖 Visão Jarvis REGENI — Pós-Launch

> Registrado em 16/abr/2026 pelo CEO. Implementação após 1º de maio quando REGENI tiver usuários pagantes validados.

---

## Contexto
Renisson, fundador solo + irmão programador (TDAH, apoio pontual). Notebook Ubuntu dedicado 24/7. Princípio: "sem humanos trabalhando, só eu + irmão + IAs".

## Equipe de Agentes Sonhada

### 🎯 AGENTE-ALFA (COO)
Coordenador central via Telegram (BotFather já configurado).
Lê mensagens do Renisson, distribui tarefas aos outros agentes, consolida relatórios.
**Modelo:** Claude Sonnet (tomada de decisão).

### 🔍 AGENTE-AUDITOR (Qualidade Dados)
Roda a cada 6h, detecta anomalias em banco (duplicatas, paces absurdos, corridas lixo).
Cria tickets em cerebro/agentes/auditor/tickets/.
**Modelo:** Claude Haiku (volume alto, análise simples).

### 🎨 AGENTE-QA (UI Tests) — PRIMEIRO A CONSTRUIR
Playwright 24/7 em 4 abas. Screenshots automáticos, comparação com baseline, detecção de regressão.
**Modelo:** Haiku + Sonnet (Sonnet só quando vê algo suspeito).
**Status:** Construção em 17-18/abr.

### ⚡ AGENTE-SCRAPER
Mantém scrapers vivos, detecta fontes novas automaticamente, re-executa falhas.
Meta: 10M resultados até Dez/2026.
**Modelo:** Haiku (tarefa repetitiva).

### 🛠️ AGENTE-DEV
Recebe tickets → escreve código → testa → PR no GitHub.
Commita sozinho se: mudança em dados, CSS simples, conteúdo.
Pede aprovação do CEO se: schema, rotas, segurança, pagamentos.
**Modelo:** Sonnet (precisa escrever código bom).

## Infraestrutura Física

### Quarto REGENI Dedicado
- Notebook Ubuntu 24/7 (já tem)
- Monitor externo 32"+ pra dashboard dos agentes
- Câmera + microfone quality pra comando de voz
- Boa iluminação pra gravação de conteúdo

### Comando de Voz (estilo Jarvis)
- Whisper (transcrição local, não envia pra nuvem)
- Claude como cérebro
- TTS com voz customizada (ElevenLabs ou Piper local)
- Wake word: "REGENI"

### Segurança
- Criptografia AES-256 nos arquivos locais
- Backup criptografado em cloud (Backblaze B2)
- Senha mestra só do Renisson
- 2FA em GitHub, Railway, Mercado Pago
- Firewall configurado no Ubuntu

## Stack Híbrida de IAs
| Tarefa | IA | Custo |
|--------|-----|-------|
| Decisões críticas | Claude Opus (via CEO web) | Incluso no plano |
| Agentes operacionais | Claude Sonnet | R$ 200-300/mês |
| Auditorias alto volume | Claude Haiku | R$ 50/mês |
| Alternativa free | Gemini 2.0 Flash | R$ 0 |
| OCR de PDFs | Tesseract local | R$ 0 |
| Transcrição voz | Whisper local | R$ 0 |

## Princípios
1. Nunca reinventar — consultar cérebro antes de agir
2. Toda IA nova lê 00-LEIA-PRIMEIRO ao entrar
3. Agentes aprendem com tickets resolvidos (feed de conhecimento)
4. CEO humano (Renisson) SEMPRE revisa: schema, segurança, pagamentos
5. Dados ficam locais. Nuvem só pra app público.

## Financiamento
NÃO tirar do bolso do Renisson depois do launch.
Com R$ 4,99 × 1000 pagantes = R$ 4.990/mês, paga toda a infra + sobra pra desenvolvimento.
Meta: 1000 pagantes até Out/2026.

## Data-alvo
Início da construção: após 1º maio 2026 (pós-launch), só depois de ter usuários pagantes reais.
