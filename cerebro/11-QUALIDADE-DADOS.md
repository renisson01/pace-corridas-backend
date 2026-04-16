# 📊 Sistema de Qualidade de Dados REGENI

> Documentado em 16/abr/2026. Problema central: dados importados de 30+ fontes têm erros de origem.
> Implementação: Fase 1 esta semana, Fase 2 semana seguinte, Fase 3 pós-launch.

---

## Tipos de Erro Encontrados

| Tipo | Exemplo | Volume estimado | Causa |
|------|---------|----------------|-------|
| Distância errada | Atleta correu 5K mas registro diz 10K | ~5-10% | Chipagem registra evento multi-distância com distância única |
| Pace impossível | 2:00/km em 5K | ~1% | Distância errada na fonte |
| Pace muito lento | 15:00/km em 5K | ~3% | Caminhada ou distância errada |
| Nome duplicado | "RENISSON SILVA" vs "RENISSON DA SILVA" | ~10% dos atletas | Variação de registro entre eventos |
| Idade impossível | 0, 999, >100 | 81k atletas | Campo mal populado na fonte |
| Estado vazio | "" em 79k atletas | 79k | Fonte não informou |

## Limites Humanos por Distância (pace mínimo possível)

| Distância | Recorde mundial | Pace mínimo aceito | Pace máximo razoável |
|-----------|----------------|--------------------|--------------------|
| 3K | ~7:20 (2:27/km) | 2:20/km | 10:00/km |
| 5K | 12:35 (2:31/km) | 2:25/km | 10:00/km |
| 6K | ~15:10 | 2:28/km | 10:00/km |
| 7K | ~17:40 | 2:30/km | 10:00/km |
| 8K | ~20:30 | 2:30/km | 10:00/km |
| 10K | 26:11 (2:37/km) | 2:30/km | 10:00/km |
| 12K | ~32:00 | 2:35/km | 10:00/km |
| 15K | 40:33 (2:42/km) | 2:35/km | 10:00/km |
| 21K | 57:31 (2:44/km) | 2:40/km | 10:00/km |
| 42K | 2:00:35 (2:51/km) | 2:45/km | 10:00/km |

## Princípios

1. **NUNCA deletar dados** — sempre flaggear (campo `flagged` + `flagReason`)
2. **Corredor é inocente até que se prove culpado** — dados ficam visíveis, mas marcados
3. **Atleta Premium pode corrigir** — parte do valor do plano R$ 4,99
4. **Fonte oficial vence fonte não-oficial** — CBAt > ChipTiming > scraper genérico
5. **Maioria vence** — se 2 de 3 fontes concordam, a maioria está certa

## Fase 1 — Limpeza BATCH (script)

Script: scripts/validar-resultados.cjs
- Aplica regras de pace mínimo/máximo por distância
- Marca resultado como flagged=true, flagReason="pace_impossivel"
- NÃO remove, NÃO edita — só marca
- Gera relatório em cerebro/agentes/auditor/relatorio-validacao.md

## Fase 2 — Consistência por Atleta

Script: scripts/perfil-atleta-consistencia.cjs
- Para cada atleta com 3+ resultados: calcular pace médio + desvio padrão
- Resultado com pace > média + 2*desvio → flagReason="outlier_pace"
- Gera lista de atletas com dados inconsistentes

## Fase 3 — Identity Resolution (pós-launch)

- Merge de nomes similares (Levenshtein + normalização)
- Cruzamento entre fontes
- IA para casos ambíguos
- Atleta Premium pode vincular/corrigir manualmente
