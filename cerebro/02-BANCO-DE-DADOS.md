# Banco de Dados — Modelos Prisma

← [[00-INDEX]]

> Provider: PostgreSQL · ORM: Prisma v6  
> Schema: `prisma/schema.prisma`  
> Singleton client: `src/lib/prisma.js`

---

## Diagrama de Relações (simplificado)

```
User ──1:1──► Athlete ──► Result[] ◄── Race
  │
  ├──► Post[] / Comment[] / Like[] / Follow[]
  ├──► AtividadeGPS[]
  ├──► IaConversa (1:1)
  ├──► CoachProfile (1:1) ──► CoachAtleta[] ──► User
  ├──► MembroComunidade[] ──► Comunidade
  ├──► CobaiaDiario[] / CobaiaAlimentacao[] / CobaiaSauna[] / CobaiaExame[]
  ├──► IntegracaoToken[]   (Strava/Garmin/Polar)
  └──► PedidoCompleto[]    (loja)
```

---

## Modelos

### Race
Corrida passada com resultados (não é inscrição aberta).

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | String (cuid) | PK |
| `name` | String | Nome da corrida |
| `date` | DateTime | Data da corrida |
| `city` | String | |
| `state` | String | UF |
| `distances` | String | Ex: "5K,10K,21K" (texto livre) |
| `organizer` | String | |
| `status` | String | default: "upcoming" |
| `registrationUrl` | String? | |
| `imageUrl` | String? | |
| `results` | Result[] | |

---

### Athlete
Atleta deduplificado do scraper (independente de ter User).

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | String (cuid) | PK |
| `name` | String | |
| `equipe` | String? | Assessoria/clube |
| `state` | String? | UF |
| `gender` | String? | M / F |
| `age` | Int? | |
| `totalRaces` | Int | Recalculado diariamente pelo Agente 3 |
| `totalPoints` | Int | 21 pts × totalRaces |
| `user` | User? | Vínculo opcional com conta User |

---

### Result
Resultado de um atleta em uma corrida. Constraint unique: `(athleteId, raceId)`.

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | String (cuid) | PK |
| `athleteId` | String | FK → Athlete |
| `raceId` | String | FK → Race |
| `time` | String | Ex: "00:45:23" ou "45:23" |
| `pace` | String? | Ex: "4:32/km" |
| `overallRank` | Int? | Posição geral |
| `genderRank` | Int? | Posição por gênero |
| `ageGroup` | String? | Ex: "35-39" |
| `distance` | String? | Ex: "10K", "21K" |
| `points` | Int | default: 0 |

> **Atenção:** `time` é armazenado como String em formato variável (`HH:MM:SS` ou `MM:SS`). O frontend usa `formatTime()` para remover o `00:` de tempos sub-1h.

---

### User
Conta registrada na plataforma.

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | String (cuid) | PK |
| `email` | String | unique |
| `passwordHash` | String | bcryptjs |
| `name` | String | |
| `athleteId` | String? | unique — vínculo com Athlete |
| `bip39Hash` | String | Frase de recuperação BIP39 |
| `isPremium` | Boolean | |
| `premiumUntil` | DateTime? | |
| `isAdmin` | Boolean | |
| `isOrganizer` | Boolean | |
| `isCoach` | Boolean | Guard em `/treinador.html` |
| `tempo5k/10k/21k/42k` | String? | Tempos de referência manuais |
| `fcMax / fcRepouso` | Int? | Frequência cardíaca |

---

### CorridaAberta
Corridas futuras com inscrições abertas (diferente de `Race`).

| Campo | Tipo | Notas |
|-------|------|-------|
| `nome` | String | |
| `data` | DateTime | |
| `cidade / estado` | String | |
| `distancias` | String | Texto livre |
| `linkInscricao` | String | |
| `preco` | Float? | |
| `temKit` | Boolean | |
| `tipoPiso` | String? | asfalto / trail / pista |
| `tipoPerfil` | String? | plano / montanhoso |
| `vagasTotal / vagasRestantes` | Int? | |
| `checklist` | String? | JSON-like |
| `favoritos` | FavoritoCorrida[] | |

---

### AtividadeGPS
Atividade física com dados de GPS (corrida manual ou sync Strava).

| Campo | Tipo | Notas |
|-------|------|-------|
| `userId` | String | FK → User |
| `tipo` | String | default: "corrida" |
| `distanciaKm` | Float | |
| `duracaoSeg` | Int | segundos totais |
| `paceMedio` | String? | Ex: "5:23" |
| `velMedia` | Float? | km/h |
| `elevacaoGanho` | Float? | metros |
| `rotaJSON` | String? | GeoJSON da rota |
| `fonte` | String? | manual / strava / garmin / polar |
| `stravaId` | String? | unique — deduplicação Strava |

---

### Comunidade
Grupo com mensagens, treinos e mural de fotos.

| Campo | Tipo | Notas |
|-------|------|-------|
| `nome / slug` | String | slug é unique |
| `tipo` | String | aberto / fechado / privado |
| `generoRestrito` | String? | M / F / null |
| `maxMembros` | Int? | |
| `aprovacaoManual` | Boolean | |
| `membros` | MembroComunidade[] | role: membro/admin/moderador |
| `mensagens` | MensagemComunidade[] | |
| `treinos` | Treino[] | com TreinoEtapa[] estruturadas |

---

### CoachProfile
Perfil de treinador vinculado a um User com `isCoach = true`.

| Campo | Tipo | Notas |
|-------|------|-------|
| `userId` | String | unique, FK → User |
| `bio / especialidade` | String? | |
| `instagram / whatsapp` | String? | |
| `ativo` | Boolean | |
| `atletas` | CoachAtleta[] | |
| `subscription` | CoachSubscription? | |

---

### Protocolo Cobaia

| Modelo | Conteúdo |
|--------|----------|
| `CobaiaDiario` | Peso, gordura%, massa magra, HRV, sono, humor, energia, Vyvanse |
| `CobaiaAlimentacao` | Refeições com foto, calorias, proteína, carb, gordura |
| `CobaiaSauna` | Protocolo, duração, temp, FC antes/depois, sensação |
| `CobaiaExame` | Hemograma, lipidograma, hormonal, inflamatório, vitaminas |
| `CobaiaAgenda` | Agenda de treinos, consultas, medicações |

---

### Saúde / Biológico

| Modelo | Campos-chave |
|--------|-------------|
| `BioAgeRecord` | `chronoAge`, `bioAge`, `delta`, `vo2max`, `hrv`, `sleepScore` |
| `RodaVida` | 12 dimensões (carreira, saúde, família, amor, etc.) 1–10 |
| `IaPerfilCorredor` | 10 dimensões para personalização do coach IA |
| `DecisionLog` | `userState`, `priorities`, `dayPlan` (JSON) |

---

### Loja

```
Assessoria ──► Produto[] ──► ProdutoVariante[]
                               └──► PedidoItem[]
                                      └──► PedidoCompleto ──► User
```

---

### Social

| Modelo | Constraint unique |
|--------|------------------|
| `Like` | (fromUserId, toUserId) |
| `Follow` | (followerId, followingId) |
| `PostLike` | (userId, postId) |
| `AmigoPace` | (enviadoPor, recebidoPor) |
| `Conquista` | (userId, tipo) |

---

## Convenções de campos

- IDs: `String @id @default(cuid())`
- Timestamps: `createdAt DateTime @default(now())` / `updatedAt DateTime @updatedAt`
- Campos em português: `nome`, `data`, `cidade`, `estado`, `criadoEm`, `atualizadoEm`
- Campos herdados do schema inglês (Athlete, Race, Result, User): mantidos em inglês
- Arrays/JSON complexos: armazenados como `String` (ex: `rotaJSON`, `mensagens`, `checklist`)
