# DOMÍNIO: CORRIDA DE RUA NO BRASIL
> Documento de referência para o fundador da PACE. Atualizado: 2026-04-19.

---

## 1. Estrutura do Esporte

### Hierarquia regulatória
```
World Athletics (WA)
  └── CBAt — Confederação Brasileira de Atletismo
        └── Federações Estaduais (FPA/SP, FARJ/RJ, FAERGS/RS, FAB/BA, etc.)
              └── Associações municipais
```

- **CBAt** regulamenta todas as corridas de rua no Brasil (Norma 12)
- **ABRAM** — Atletismo Master (60+), tem calendário e ranking próprios
- **Corridas de rua ≠ maratona**: maratona é uma distância específica (42,195 km); corrida de rua é qualquer prova nas ruas de 1km a 100km+
- Corrida de rua **não precisa** de homologação CBAt para acontecer — a maioria das corridas locais não tem
- Provas com prêmio em dinheiro ou que valem ranking estadual/nacional precisam ser homologadas

---

## 2. Categorias por Faixa Etária (Norma 12 CBAt)

A categoria é calculada pela **idade que o atleta completa até 31/dez do ano da prova**.

| Categoria | Faixa | Observação |
|-----------|-------|------------|
| Juvenil | 16–19 | raro em corridas de rua abertas |
| Sub-23 / Adulto | 20–24 | |
| Adulto | 25–29 | |
| Adulto | 30–34 | maior volume de participantes |
| Adulto | 35–39 | |
| Master A | 40–44 | |
| Master A | 45–49 | |
| Master B | 50–54 | |
| Master B | 55–59 | |
| Master C | 60–64 | crescimento forte |
| Master C | 65–69 | |
| Master D | 70–74 | |
| Master D | 75–79 | |
| Master E | 80+ | |

### PCD (Pessoa com Deficiência)
- Cadeirantes (T51–T54)
- Deficiência visual com guia
- Amputados com prótese
- Outras deficiências — cada evento define as subclasses aceitas

### Como sistemas de cronometragem registram isso
- Wiclax (CLAX): campo `ca` no XML
- RaceZone: campo `c` (id da categoria) com mapa em `event.json`
- Runking: campo `categoryName` (string livre)
- ChipTiming: campo direto na API

---

## 3. Distâncias Oficiais

| Distância | Popularidade | Público-alvo |
|-----------|-------------|--------------|
| **5K** | ★★★★★ | Iniciantes, recreativos, corridas locais |
| **10K** | ★★★★★ | Mais vendida no Brasil |
| 15K | ★★ | Raro — alguns eventos intermediários |
| **21K / Meia Maratona** | ★★★★ | Prova de prestígio, treinados |
| **42K / Maratona** | ★★★ | Elite + amadores dedicados |
| Ultra (50K, 100K) | ★ | Nicho (trail run, ultra) |

### Idades mínimas (CBAt)
- 5K → 14 anos
- 10K → 16 anos
- 21K → 18 anos
- 42K → 20 anos

---

## 4. Tempos — Chip vs Bruto

### Definições
- **Tempo Bruto (Gun Time)**: do tiro de largada até cruzar a linha de chegada
- **Tempo Líquido (Chip Time / Net Time)**: do momento que o atleta **cruza a linha de largada** até a chegada

### Por que existe diferença?
Em corridas grandes (10k+), a largada é escalonada em "blocos" por pace estimado. Um corredor no bloco F pode cruzar a largada 5–10min depois do tiro. Seu chip time é justo; o gun time penaliza.

### Ranking oficial
- Top 5 (elite): gun time define posição
- Demais: chip time define posição na categoria
- Para o corredor recreativo, **chip time é o que importa**

### Pace (ritmo)
- **Unidade**: min/km (Brasil e Europa). Jamais usar km/h.
- **Cálculo**: `pace = tempo_total_segundos / distância_km / 60`
- **Referências práticas:**

| Nível | Pace 5K | Pace 10K | Pace 21K | Pace 42K |
|-------|---------|---------|---------|---------|
| Elite masculino | <3:00/km | <3:00/km | <3:05/km | <3:10/km |
| Elite feminino | <3:30/km | <3:30/km | <3:35/km | <3:40/km |
| Amador avançado | 4:00–5:00 | 4:30–5:00 | 5:00–5:30 | 5:30–6:00 |
| Mediano masculino | ~6:00/km | ~5:50/km | ~6:20/km | ~7:00/km |
| Mediano feminino | ~7:00/km | ~6:50/km | ~7:30/km | ~8:00/km |
| Recreativo | >8:00/km | >8:00/km | >9:00/km | >10:00/km |

### Tempos de referência (medianas brasileiras — ChronoMAX 2023–2025)
- 5K masculino: ~30min
- 5K feminino: ~35min
- 10K masculino: ~58min
- 10K feminino: ~1h08
- 21K masculino: ~2h10
- 21K feminino: ~2h30
- 42K masculino: ~4h30
- 42K feminino: ~5h00

---

## 5. Ecossistema de Corrida de Rua no Brasil

### Organizadores de eventos (quem CRIA a corrida)
| Organizador | Provas icônicas | Região |
|------------|----------------|--------|
| **Yescom** | São Silvestre, Maratona SP, Volta da Pampulha | SP/MG |
| **D2D Eventos** | Night Run Series | nacional |
| **Kamel Produções** | Track&Field Run Series | SP |
| **Total Sport** | Circuito das Estações | SP |
| Iguana Sports | corridas locais RJ | RJ |
| Run Sports | corridas locais | SP |
| Cada cidade tem 3–10 organizadores locais | |

### Cronometradoras (quem MEDE o tempo)
| Cronometradora | Sistema | Volume | Região |
|---------------|---------|--------|--------|
| **ChipTiming** | Proprietário | ~3.2M resultados | Nacional (braço da Yescom) |
| **ChronoMAX / Runking** | Proprietário | >2.6M (só 2 eventos nossos) | SP/RJ/Sul |
| **ChipBrasil** | CLAX + Puppeteer | 236k | DF/GO/SE |
| **SportsChrono** | RaceZone JSON | 270k | SE/NE |
| **MyCrono** | RaceZone JSON | ~79 eventos | SC/NE/PB |
| **TriChip** | CLAX (Wiclax) | 90k | RS |
| **CronosChip** | CLAX | 40k | variado |
| **TimeCrono** | CLAX | 26k | PE |
| **GlobalCronometragem** | Cheerio | 18k | SP |
| **ACrono** | CLAX | 1.8k | MT |
| **SMCrono** | CLAX | ~69 eventos | SC/Sul |
| **Central de Resultados** | variado | 133k | nacional |
| APCrono | WordPress | ~39 pgs | NE/RN |
| CronusChip | CLAX | variado | NE |

### Fabricantes de sistema/equipamento
- **RaceZone** (Timbó/SC) — fabrica chips RFID + software RacetagPRO + plataforma JSON
- **Wiclax** (França) — software de cronometragem, formato CLAX/XML, usado por ~10 cronometradoras BR
- **ChipTiming** — sistema proprietário, maior da América Latina
- **Runking** — plataforma de resultados (Vue.js, AES-encrypted)

### Plataformas de inscrição (não confundir com cronometradoras)
- **Ticket Sports** — maior do Brasil
- **Sympla**
- **Minhas Inscrições**
- **Central do Atleta**
- Sites próprios dos organizadores

> Cronometradora ≠ Plataforma de inscrição. O atleta se inscreve em um lugar, corre com chip de outro fornecedor, e o resultado vai para uma terceira plataforma.

---

## 6. Calendário Típico

```
JAN  FEV  MAR  ABR  MAI  JUN  JUL  AGO  SET  OUT  NOV  DEZ
 ↓    ↓    ↑↑   ↑↑   ↑↑   ↑↑   ↓    ↑    ↑↑   ↑↑   ↑↑   ↑(Silvestre)
```

- **TODO final de semana** tem corrida em alguma cidade do Brasil
- **Picos**: março–junho (outono, clima ameno) e setembro–novembro (primavera)
- **31/dez**: São Silvestre — encerramento do ano competitivo
- **Janeiro–fevereiro**: baixa temporada (verão/calor extremo no Sudeste)
- Cada cidade grande tem **ranking municipal anual** (ex: Ranking Paulista CBAt)

---

## 7. Perfil do Corredor Brasileiro (ChronoMAX 2023–2025)

| Dado | Valor |
|------|-------|
| % Mulheres | **51,8%** — mulheres são maioria |
| % Homens | 48,2% |
| Faixa mais ativa | 30–34 anos |
| Crescimento mais forte | 60+ (Master) |
| Sudeste | 51,2% dos participantes |
| Sul | 16,6% |
| Nordeste | 16,1% |
| Centro-Oeste | 8,9% |
| Norte | 3,2% |

---

## 8. O que o Corredor QUER (por prioridade)

1. **VER SEU RESULTADO** — nome, tempo, posição, pace — imediatamente após cruzar a chegada
2. **Comparar com outras corridas** que já fez (evolução pessoal)
3. **Ver ranking** — onde se posiciona vs atletas da mesma faixa etária ou cidade
4. **Encontrar próximas corridas** para se inscrever
5. **Certificado finisher** — PDF com nome, tempo, posição
6. **Fotos da corrida** — link para fotógrafo oficial
7. **Compartilhar no Instagram/WhatsApp** — screenshot do resultado

> O tempo entre cruzar a chegada e ver o resultado online é **o momento de ouro**. Corredor que corre HOJE quer ver resultado HOJE.

---

## 9. Glossário do Corredor

| Termo | Significado |
|-------|------------|
| **Pace** | Ritmo em min/km (nunca km/h) |
| **PB / PR** | Personal Best / Personal Record — recorde pessoal |
| **Negativo** | Segunda metade mais rápida que a primeira (ideal) |
| **Positivo** | Segunda metade mais lenta (usual para iniciantes) |
| **Tiro / Sprint** | Aceleração curta e intensa |
| **Fartlek** | Treino com variações de ritmo em terreno livre |
| **Intervalado** | Treino com blocos de esforço e recuperação |
| **Longo** | Treino de distância longa em ritmo confortável |
| **Largada** | Linha de início |
| **Pelotão / Bloco** | Grupos de largada por pace estimado |
| **Assessoria** | Grupo de treinamento / running club |
| **Planilha** | Plano de treino |
| **Número de peito / Bib** | Numeral do atleta |
| **Chip** | Transponder RFID colado no tênis ou no bib |
| **Tapete** | Antena no chão que lê o chip (início e fim) |
| **Gun time** | Tempo bruto (do tiro até a chegada) |
| **Chip time / Net time** | Tempo líquido (do tapete de largada até chegada) |
| **DNF** | Did Not Finish — não completou a prova |
| **DNS** | Did Not Start — estava inscrito mas não largou |
| **Finisher** | Completou a prova |
| **Garmin / Polar / Suunto** | Marcas de relógio GPS (hardware, não software) |
| **Strava** | App de log de treinos — o "Instagram dos corredores" |
| **VO2max** | Consumo máximo de oxigênio — métrica de condicionamento |
| **Taper** | Redução de volume nos dias antes de uma prova importante |
| **Wall / Muro** | Momento de colapso de glicogênio (~30km na maratona) |

---

## 10. Corridas Mais Importantes do Brasil

| Rank | Corrida | Cidade | Mês | Participantes |
|------|---------|--------|-----|--------------|
| 1 | **São Silvestre** | São Paulo | 31/dez | ~30k |
| 2 | **Maratona de São Paulo** | São Paulo | março | ~35k |
| 3 | **Meia Maratona de São Paulo** | São Paulo | outubro | ~25k |
| 4 | **Night Run Series** | múltiplas cidades | todo ano | ~100k/ano |
| 5 | **Volta da Pampulha** | Belo Horizonte | dezembro | ~15k |
| 6 | **Maratona do Rio** | Rio de Janeiro | junho | ~20k |
| 7 | **Meia do Rio** | Rio de Janeiro | agosto | ~15k |
| 8 | **Maratona de Porto Alegre** | Porto Alegre | junho | ~8k |
| 9 | **Maratona de Curitiba** | Curitiba | outubro | ~10k |
| 10 | **Track&Field Run Series** | múltiplas cidades | todo ano | ~60k/ano |
| 11 | **Circuito das Estações** | São Paulo | 4x/ano | ~15k/etapa |
| 12 | **Corrida da Mulher** | São Paulo | outubro | ~20k |
| 13 | **Maratona de Salvador** | Salvador | abril | ~5k |
| 14 | **Meia de Brasília** | Brasília | julho | ~8k |
| 15 | **Corrida Rei Pelé** | Maceió/AL | dezembro | ~5k |

---

## 11. Métricas de Qualidade para a PACE

### O que torna um resultado "bom" para exibir?
- Tempo válido (HH:MM:SS, > 0, < 8h para 42K)
- Nome do atleta não é genérico ("ATLETA", "TESTE", "X")
- Distância reconhecida (3K–42K)
- Data da corrida ≤ hoje

### O que indica dado ruim?
- Pace < 2:00/km (impossível para humanos em corrida de rua)
- Pace > 20:00/km (caminhada muito lenta — provavelmente erro)
- Mesmo atleta com 2 resultados no mesmo evento (duplicata por nome)
- Data no futuro (evento ainda não aconteceu)

---

## 12. Referências

- [CBAt Norma 12](https://www.cbat.org.br) — regulamento oficial
- [World Athletics](https://worldathletics.org) — regras internacionais
- [RaceZone](https://racezone.com.br) — fabricante de sistemas (Timbó/SC)
- [Wiclax](https://www.wiclax.com) — software francês de cronometragem
- [ChronoMAX/Runking](https://resultados.runking.com.br) — plataforma de resultados (36 empresas)
- [ChipTiming](https://resultado.chiptiming.com.br) — maior cronometradora BR
