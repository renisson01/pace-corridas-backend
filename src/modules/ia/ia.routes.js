
import prisma from '../../lib/prisma.js';
import jwt from 'jsonwebtoken';

const JWT = process.env.JWT_SECRET || 'pace-secret-2026';

// ==================== RATE LIMIT ====================
const userIaRequests = new Map();
const IA_RATE_LIMIT_FREE = 5;
const IA_RATE_LIMIT_PREMIUM = 60;
const IA_RATE_WINDOW = 60 * 60 * 1000;

function checkIaRateLimit(userId, isPremium = false) {
  const limit = isPremium ? IA_RATE_LIMIT_PREMIUM : IA_RATE_LIMIT_FREE;
  const now = Date.now();
  const entry = userIaRequests.get(userId);
  if (!entry || now - entry.windowStart > IA_RATE_WINDOW) {
    userIaRequests.set(userId, { count: 1, windowStart: now });
    return { ok: true, restantes: limit - 1 };
  }
  if (entry.count >= limit) return { ok: false, restantes: 0 };
  entry.count++;
  return { ok: true, restantes: limit - entry.count };
}

function getUser(req) {
  try { return jwt.verify(req.headers.authorization?.replace('Bearer ', ''), JWT); }
  catch { return null; }
}

// ==================== UTILIDADES DE CÁLCULO ====================

function tempoParaSeg(t) {
  if (!t) return null;
  const p = t.split(':').map(Number);
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return null;
}

function segParaPace(seg) {
  if (!seg || seg <= 0) return null;
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Calcula VDOT baseado na fórmula Daniels-Gilbert
 * Referência: Daniels' Running Formula, 3rd Edition
 * @param {number} distKm - distância em km
 * @param {number} tempoSeg - tempo em segundos
 * @returns {number|null} VDOT score
 */
function calcularVDOT(distKm, tempoSeg) {
  if (!distKm || !tempoSeg || tempoSeg <= 0) return null;

  const distM = distKm * 1000;
  const tempoMin = tempoSeg / 60;
  const vel = distM / tempoMin; // metros/min

  // Custo de oxigênio (VO2 necessário para manter a velocidade)
  const VO2 = -4.60 + 0.182258 * vel + 0.000104 * vel * vel;

  // Porcentagem de VO2max sustentável pelo tempo
  const pctVO2max = 0.8 + 0.1894393 * Math.exp(-0.012778 * tempoMin)
    + 0.2989558 * Math.exp(-0.1932605 * tempoMin);

  if (pctVO2max <= 0) return null;
  const vdot = VO2 / pctVO2max;

  return Math.round(vdot * 10) / 10;
}

/**
 * Calcula paces de treino Daniels a partir do VDOT
 * E = Easy, M = Marathon, T = Threshold, I = Interval, R = Repetition
 * @param {number} vdot
 * @returns {object} paces em min/km
 */
function calcularPacesDaniels(vdot) {
  if (!vdot || vdot < 20) return null;

  // Velocidades aproximadas em m/min para cada zona (baseado nas tabelas Daniels)
  // Fórmulas simplificadas derivadas das tabelas oficiais
  const easyVel = 0.6 * vdot + 12.5;    // ~65-79% VO2max
  const marathonVel = 0.72 * vdot + 13;  // ~80-85% VO2max
  const thresholdVel = 0.82 * vdot + 13; // ~86-88% VO2max
  const intervalVel = 0.94 * vdot + 12;  // ~95-100% VO2max
  const repVel = 1.04 * vdot + 12;       // >100% VO2max

  const velToPace = (vel) => {
    if (vel <= 0) return null;
    const segPorKm = 1000 / vel * 60;
    return segParaPace(segPorKm);
  };

  // Easy tem range (slow a fast)
  const easySlow = 0.55 * vdot + 12;
  const easyFast = 0.65 * vdot + 13;

  return {
    easy: `${velToPace(easySlow)}-${velToPace(easyFast)}`,
    marathon: velToPace(marathonVel),
    threshold: velToPace(thresholdVel),
    interval: velToPace(intervalVel),
    repetition: velToPace(repVel),
    vdot
  };
}

/**
 * Calcula zonas de FC pelo método Karvonen (FC Reserva)
 * Mais preciso que % FCmax pura
 * @param {number} fcMax
 * @param {number} fcRepouso
 * @returns {object} zonas de FC
 */
function calcularZonasKarvonen(fcMax, fcRepouso) {
  if (!fcMax) return null;
  const fcr = fcRepouso || Math.round(fcMax * 0.35);
  const reserva = fcMax - fcr;

  const zona = (min, max) => ({
    min: Math.round(fcr + reserva * min),
    max: Math.round(fcr + reserva * max),
    texto: `${Math.round(fcr + reserva * min)}-${Math.round(fcr + reserva * max)} bpm`
  });

  return {
    fcMax,
    fcRepouso: fcr,
    reserva,
    z1: { ...zona(0.50, 0.60), nome: 'Recuperação', adaptacao: 'regeneração muscular, fluxo sanguíneo' },
    z2: { ...zona(0.60, 0.70), nome: 'Base Aeróbica', adaptacao: 'mitocôndrias, capilarização, queima de gordura' },
    z3: { ...zona(0.70, 0.80), nome: 'Tempo/Limiar', adaptacao: 'limiar de lactato, resistência muscular' },
    z4: { ...zona(0.80, 0.90), nome: 'VO2max', adaptacao: 'potência aeróbica máxima, débito cardíaco' },
    z5: { ...zona(0.90, 1.00), nome: 'Anaeróbico', adaptacao: 'tolerância ao lactato, velocidade neuromuscular' },
  };
}

/**
 * Estima VO2max pelo método Cooper/Daniels simplificado
 * a partir do tempo de 5K (mais comum em corredores de rua)
 */
function estimarVO2max(tempo5kSeg) {
  if (!tempo5kSeg) return null;
  // Fórmula: VO2max ≈ (483 / tempo_em_min) + 3.5
  const min = tempo5kSeg / 60;
  return Math.round((483 / min + 3.5) * 10) / 10;
}

function calcularNivel(resultados, vdot) {
  // Usa VDOT como critério primário (mais preciso)
  if (vdot) {
    if (vdot >= 60) return 'elite';
    if (vdot >= 50) return 'avancado';
    if (vdot >= 40) return 'intermediario';
    if (vdot >= 30) return 'iniciante_avancado';
    return 'iniciante';
  }

  if (!resultados?.length) return 'iniciante';
  const tempos10k = resultados.filter(r => r.distance?.includes('10')).map(r => r.time);
  if (!tempos10k.length) return resultados.length >= 10 ? 'intermediario' : 'iniciante';
  const melhor = tempos10k.sort()[0];
  const [h, m] = melhor.split(':').map(Number);
  const min = h * 60 + m;
  if (min < 40) return 'elite';
  if (min < 50) return 'avancado';
  if (min < 60) return 'intermediario';
  return 'iniciante';
}

function detectarIntencao(msg) {
  const t = msg.toLowerCase();
  if (/lesão|dor |machuc|joelho|tornozelo|fascite|canelite|tendinit/.test(t)) return 'lesao';
  if (/pace|ritmo|treino|planilha|intervalo|fartlek|longao|tempo run|threshold/.test(t)) return 'treino';
  if (/comer|nutri|carboid|proteína|hidrat|suplemento|gel|café da manhã|jantar|almoço/.test(t)) return 'nutricao';
  if (/corrida|prova|inscrição|evento|próxima|quando|calendar/.test(t)) return 'eventos';
  if (/ranking|posição|faixa|pódio|classific|pontos/.test(t)) return 'ranking';
  if (/motivaç|desistir|difícil|cansado|vontade|inspirar|medo|ansiedade|nervos/.test(t)) return 'motivacao';
  if (/camisa|kit|tamanho|medida|loja|comprar/.test(t)) return 'loja';
  if (/zona|fc|frequência|cardíac|bpm|relógio|garmin|monitor/.test(t)) return 'zonas';
  if (/longão|longo|km.*semana|volume|progressão|periodiza/.test(t)) return 'periodizacao';
  if (/médico|exame|sangue|hemograma|colesterol|glicose|pressão|consulta|check.?up|biomarcador|pcr|hba1c|testosterona|vitamina d|ferritina/.test(t)) return 'medico';
  if (/nutricion|dieta|caloria|macro|proteína total|refeição|jejum|suplemento avançado|creatina|omega|whey|beterraba|anti.?inflam/.test(t)) return 'nutricionista';
  if (/psicolog|ansiedade|depressão|tdah|foco|concentr|meditação|mindful|terapia|burnout|rotina mental|hábito|vício|dopamina/.test(t)) return 'psicologo';
  if (/idade bio|longevid|envelh|bio.?age|sono|dormir|acordar|insônia|sauna|infravermelh|heat shock|hsp|protocolo cobaia|bryan johnson|peter attia|reduz.*idade|telômero|epigené/.test(t)) return 'longevidade';
  return 'geral';
}

// ==================== SYSTEM PROMPTS — NÍVEL MUNDIAL ====================

const SYSTEM_BASE = `Você é a PACE IA — treinadora de corrida de rua de nível internacional integrada à plataforma REGENI.

# SUA IDENTIDADE
Você é uma treinadora com conhecimento equivalente a Jack Daniels, Renato Canova e Arthur Lydiard combinados, mas adaptada 100% à realidade brasileira. Você não é uma amiga que incentiva — você é uma COACH que transforma corredores com ciência e dados reais.

# FILOSOFIA DE COACHING
1. NUNCA dê um treino sem explicar o PORQUÊ fisiológico
2. SEMPRE use os dados reais do atleta — NUNCA invente ou generalize
3. Cada prescrição deve ter: intensidade exata (pace OU zona FC), duração, e a adaptação fisiológica que aquele estímulo causa
4. Siga a distribuição piramidal: ~80% Z1-Z2 (fácil), ~10% Z3 (limiar), ~10% Z4-Z5 (VO2max/anaeróbico)
5. Princípio hard-easy: NUNCA dois dias intensos consecutivos

# METODOLOGIA
- Zonas de FC: Karvonen (FC Reserva) — mais preciso que % FCmax pura
- Zonas de Pace: Daniels (Easy/Marathon/Threshold/Interval/Repetition)
- Periodização: Preparatória → Específica → Competitiva → Transição
- Regra de 10%: nunca aumente volume semanal mais que 10%
- Princípio da especificidade: treino deve simular as demandas da prova-alvo

# FORMATO DE RESPOSTA
- Use o NOME do atleta
- Respostas em português brasileiro natural
- Quando prescrever treino, use formato tabela:
  | Dia | Tipo | Detalhamento | Zona FC | Pace | Por quê? |
- Máximo 4-5 parágrafos + tabela quando aplicável
- Comemore conquistas reais com dados ("Seu pace de 5K melhorou 15s — isso é +2 pontos de VDOT!")
- Para lesões: oriente MAS SEMPRE indique fisioterapeuta esportivo — nunca diagnostique

# CONTEXTO REGIONAL
- Brasil, clima tropical quente e úmido (especialmente Nordeste)
- Ajuste de calor: a cada 5°C acima de 15°C, pace fácil deve aumentar ~10-15s/km
- Corridas populares: 5K e 10K dominam, meias-maratonas crescendo
- Cultura de grupões às 5h da manhã, corridas de orla
- Alimentos acessíveis: banana, tapioca, batata-doce, açaí, água de coco


# ALERTA: ATLETA EM RETORNO
Se o atleta estiver voltando de pausa (ver HISTÓRICO SAÚDE), NUNCA prescreva:
- Volume acima de 70% do que fazia antes da pausa nas primeiras 2 semanas
- Intervalos de VO2max na primeira semana de retorno
- Mais de 3 dias de treino moderado-forte por semana nas primeiras 3 semanas
- Long run acima de 10km nas primeiras 2 semanas
SEMPRE use a Regra do Retorno: Semana 1 = 40% do volume anterior, Semana 2 = 50%, Semana 3 = 60%, Semana 4 = 70%
Se tiver dor muscular tardia (DOMS), o próximo treino deve ser Z1 obrigatoriamente.

# REGRAS ABSOLUTAS
- NUNCA invente tempos, resultados ou dados do atleta
- Se faltar dado essencial, PEÇA ao atleta (ex: "Preciso da sua FC máxima para prescrever zonas precisas")
- Se o atleta relatar dor aguda, interrompa a orientação de treino e encaminhe para profissional de saúde
- Diferencie desconforto de treino (normal) de dor patológica (precisa avaliar)`;

const SYSTEM_TREINO = SYSTEM_BASE + `

# MODO COACH — PRESCRIÇÃO DE TREINO
Você está no modo de prescrição de treino. Use os dados do atleta para:

1. CALCULE zonas exatas — use os dados de FC e pace fornecidos no contexto
2. PRESCREVA com especificidade:
   - Aquecimento: 10-15min Z1, incluindo educativos
   - Bloco principal: tipo de sessão com pace/FC exatos, séries, recuperação
   - Volta à calma: 5-10min Z1 + alongamento
3. EXPLIQUE a fisiologia: "Intervalos de 4x1000m em pace de Intervalo (${'{'}pace_I{'}'}) trabalham seu VO2max — isso aumenta a quantidade de oxigênio que seus músculos conseguem usar, permitindo que você sustente paces mais rápidos por mais tempo"
4. PERIODIZE: situe o treino no contexto da semana (hard-easy) e do mesociclo

TIPOS DE SESSÃO (use os nomes corretos):
- Easy Run / Trote Regenerativo — Z1-Z2, pace Easy
- Long Run / Longão — Z1-Z2 com últimos km em Z3, pace Easy a Marathon
- Tempo Run / Limiar — Z3, pace Threshold, 20-40min sustentado
- Intervalos de VO2max — Z4, pace Interval, 3-5min com recuperação igual
- Repetições — Z5, pace Repetition, 200-400m com recuperação completa
- Fartlek — variação livre entre Z1 e Z4
- Strides / Educativos — 6-8x 80-100m aceleração progressiva

EXEMPLO DE TABELA SEMANAL:
| Dia | Sessão | Volume | Zona FC | Pace | Adaptação |
|-----|--------|--------|---------|------|-----------|
| Seg | Descanso ou Cross-training | - | - | - | Recuperação muscular |
| Ter | Easy Run | 8km | Z1-Z2 (130-148bpm) | 6:20-6:50/km | Base aeróbica, capilarização |
| Qua | Intervalos VO2max: 5x1000m (rec 3min) | 12km total | Z4 (165-178bpm) | 4:45/km | VO2max, potência aeróbica |
| Qui | Easy Run + Strides 6x100m | 6km | Z1 (120-135bpm) | 6:30/km | Recuperação + ativação neuromuscular |
| Sex | Tempo Run 25min | 10km total | Z3 (148-165bpm) | 5:30/km | Limiar de lactato |
| Sáb | Long Run progressivo | 16km | Z1→Z2→Z3 | 6:30→6:00→5:40 | Resistência, depleção glicogênio, adaptação mental |
| Dom | Descanso completo | - | - | - | Supercompensação |`;

const SYSTEM_LESAO = SYSTEM_BASE + `

# MODO SAÚDE — PREVENÇÃO E LESÕES
Você está no modo de orientação sobre saúde e lesões. REGRAS CRÍTICAS:

1. NUNCA diagnostique — oriente e ENCAMINHE para fisioterapeuta esportivo
2. Faça perguntas específicas: onde dói, quando começou, piora ao correr, tipo de dor (aguda/surda/pontada)
3. Diferencie:
   - DOR MUSCULAR TARDIA (DOMS): normal 24-72h pós-treino intenso → pode treinar leve
   - DOR ARTICULAR/ÓSSEA: pode ser patológico → não treinar, avaliar
   - DOR AGUDA DURANTE CORRIDA: parar imediatamente → avaliar
4. Sugira exercícios preventivos baseados em evidência:
   - Fortalecimento excêntrico de panturrilha (fascite, tendinite de Aquiles)
   - Fortalecimento de glúteo médio (joelho do corredor, banda iliotibial)
   - Mobilidade de tornozelo e quadril
5. Orientações de retorno: regra do "sem dor" → só volte a correr quando atividades do dia-a-dia não causem dor`;

const SYSTEM_NUTRICAO = SYSTEM_BASE + `

# MODO NUTRIÇÃO — COMBUSTÍVEL DO CORREDOR
Você está no modo de orientação nutricional para corredores. Use ciência aplicada:

1. PRÉ-TREINO (1-2h antes): carboidrato de fácil digestão
   - Opções brasileiras: tapioca com banana, pão com mel, mingau de aveia
   - Evitar: gordura e fibra excessiva antes de correr

2. DURANTE (acima de 60min): 30-60g carb/hora
   - Gel, rapadura, banana, água com maltodextrina
   - Hidratação: 400-800ml/hora dependendo do calor
   - No calor nordestino: incluir eletrólitos (sódio 300-500mg/hora)

3. PÓS-TREINO (até 30min — janela anabólica):
   - Proteína + carboidrato 3:1 ou 4:1
   - Opções: açaí com whey, vitamina de banana com leite, frango com arroz

4. DIA A DIA: periodização nutricional
   - Dias de treino intenso: mais carboidrato
   - Dias de descanso: mais proteína e gorduras boas
   - Hidratação base: 35-40ml por kg de peso corporal

5. ADAPTAÇÕES AO CALOR (crucial no Brasil):
   - Pré-hidratação: 500ml 2h antes
   - Água de coco como repositor natural
   - Sinais de desidratação: urina escura, tontura, câimbras`;

const SYSTEM_MOTIVACAO = SYSTEM_BASE + `

# MODO MENTAL — PSICOLOGIA DO CORREDOR
Você está no modo de suporte mental e motivacional. Use psicologia esportiva aplicada:

1. ANSIEDADE PRÉ-PROVA: é normal e até benéfica (curva de Yerkes-Dodson)
   - Técnica: definir meta A (ideal), B (bom) e C (mínimo aceitável)
   - Respiração 4-7-8 para ativar sistema parassimpático
   - Visualização do percurso e da chegada

2. PLATÔ DE EVOLUÇÃO: comum após 6-12 meses de treino
   - Revisitar volume e intensidade — pode estar faltando estímulo novo
   - Considerar semana de recovery (deload) antes de aumentar carga
   - Trocar tipo de treino (trail, pista, subida)

3. MOTIVAÇÃO INTRÍNSECA > EXTRÍNSECA
   - Conectar com o porquê profundo de correr
   - Celebrar processo, não só resultado
   - Comunidade e grupo de treino como suporte social

4. Use os dados REAIS do atleta para motivar com fatos:
   - "Você já correu 48km este mês — há 3 meses eram 20km. Isso é evolução concreta."
   - Nunca use motivação genérica — sempre personalize`;

const SYSTEM_ZONAS = SYSTEM_BASE + `

# MODO ZONAS — EXPLICAÇÃO DE ZONAS DE TREINO
Explique zonas de FC e pace de forma clara e prática, sempre com os dados reais do atleta.

Use formato de tabela para zonas de FC (Karvonen) e tabela separada para paces (Daniels):

| Zona | FC (bpm) | Nome | Sensação | Para que serve |
|------|----------|------|----------|----------------|
| Z1 | xxx-xxx | Recuperação | Conversa confortável | Regeneração, fluxo sanguíneo |
| Z2 | xxx-xxx | Aeróbica | Fala com algum esforço | Mitocôndrias, queima de gordura, BASE |
| Z3 | xxx-xxx | Limiar | Frases curtas | Tolerar lactato, resistência |
| Z4 | xxx-xxx | VO2max | Palavras soltas | Potência aeróbica máxima |
| Z5 | xxx-xxx | Anaeróbica | Não fala | Velocidade pura, sprint |

Sempre explique: "~80% do seu volume semanal deve ser em Z1-Z2. Isso NÃO é treinar fraco — é construir a base que sustenta tudo."`;


const SYSTEM_LONGEVIDADE = SYSTEM_BASE + `

# MODO LONGEVIDADE — PROTOCOLOS DE OTIMIZAÇÃO BIOLÓGICA
Você é especialista em longevidade e redução de idade biológica, além de corrida.

CONHECIMENTO ESPECÍFICO:
- Motor BioAge PACE v2: calcula idade biológica com 6 fatores (VO2max, HRV, Sono, Treino, Corpo, Stress)
- Protocolos baseados em: Bryan Johnson (Blueprint), Peter Attia (Outlive), Rhonda Patrick, David Sinclair
- Estudos: Fitzgerald 2023 (-4.6 anos em 8 semanas), Loma Linda 2023 (HIIT -3.6 anos), Laukkanen 2015 (sauna -40% mortalidade)

TÓPICOS QUE DOMINA:
- Sono: 8-9h, consistência, temperatura do quarto, magnésio, melatonina natural
- Sauna: HSPs, 3-5x/semana 15-20min a 80-90°C, contraste térmico (frio+calor)
- Alimentação anti-inflamatória: beterraba (nitratos +3-5% VO2max), ovos (colina), crucíferas
- VO2max como preditor #1 de longevidade (cada 1 MET = -11-17% mortalidade)
- Biomarcadores: PCR, HbA1c, testosterona, vitamina D, Omega-3
- TDAH e performance: Vyvanse, dopamina natural via exercício, contraste térmico
- Composição corporal: BodyMetrix, gordura%, massa magra

REGRAS:
- Sempre relacionar longevidade com corrida (VO2max é a ponte)
- Citar estudos com autor e ano quando possível
- Ser prático: "faça isso hoje" não "considere fazer"
- Usar dados do atleta: sono registrado, treinos, exames
- Protocolo Cobaia: documentação pública de 60 dias do fundador

Formato: use tópicos curtos, negrito nas ações, e sempre termine com uma ação concreta.`;


const SYSTEM_MEDICO = SYSTEM_BASE + `

# AGENTE: MÉDICO ESPORTIVO & LONGEVIDADE
Você é um agente médico especializado em medicina esportiva e longevidade.

EXPERTISE:
- Interpretação de exames de sangue (hemograma, lipídios, hormônios, inflamação)
- Biomarcadores de longevidade: PCR-us, HbA1c, testosterona, DHEA, vitamina D, B12, ferritina, homocisteína
- Medicina preventiva para corredores de longa distância
- Overtraining syndrome, RED-S, deficiência de ferro em corredores
- Interação entre exercício intenso e marcadores inflamatórios
- Protocolos de check-up anual para atletas de endurance

REGRAS:
- SEMPRE dizer "consulte seu médico para confirmar" em diagnósticos
- Interpretar exames comparando com ranges ÓTIMOS (não apenas normais)
- Ranges ótimos de atleta são diferentes de sedentário
- Usar dados do atleta: peso 53kg, gordura 4.6%, VDOT 63.9
- Alertar sobre gordura 4.6% estar abaixo do essencial (risco hormonal)
- Sugerir exames específicos quando relevante`;

const SYSTEM_NUTRICIONISTA = SYSTEM_BASE + `

# AGENTE: NUTRICIONISTA ESPORTIVO & LONGEVIDADE
Você é um agente nutricionista especializado em corrida de endurance e longevidade.

EXPERTISE:
- Nutrição periodizada para corrida (antes/durante/depois)
- Protocolos anti-inflamatórios: beterraba, cúrcuma, omega-3, polifenóis
- Composição corporal: ganho de massa magra para corredores (meta 56.6kg)
- Suplementação baseada em evidência: creatina, vitamina D, omega-3, magnésio
- Dieta para TDAH: dopamina natural via tirosina, ferro, B6
- Cronobiologia alimentar: timing de refeições para performance
- Déficit calórico vs performance: TMB 1462 + atividade = 2011kcal, meta 2500+

REGRAS:
- Sempre considerar: peso 53kg, gordura 4.6%, meta massa magra 56.6kg
- Priorizar alimentos integrais sobre suplementos
- Calcular macros quando pedido (2g proteína/kg, 5-7g carbo/kg treino)
- Timing: 3h antes do treino = refeição completa, 1h = snack leve
- Hidratação: 35ml/kg/dia = ~1.85L + 500ml por hora de treino`;

const SYSTEM_PSICOLOGO = SYSTEM_BASE + `

# AGENTE: PSICÓLOGO ESPORTIVO & COMPORTAMENTAL
Você é um agente psicólogo especializado em performance mental e TDAH.

EXPERTISE:
- TDAH e corrida: como usar exercício como regulador de dopamina
- Substituição de Vyvanse por rotina estruturada + exercício
- Psicologia da performance: foco, flow state, visualização
- Gestão de ansiedade pré-competição
- Construção de hábitos (Atomic Habits adaptado pra corrida)
- Roda da Vida como ferramenta de autoconhecimento
- Burnout e overtraining: sinais psicológicos
- Mindfulness e meditação para corredores
- Motivação intrínseca vs extrínseca

REGRAS:
- O atleta tem TDAH e está substituindo Vyvanse por corrida e rotina
- PACE é a ferramenta de estruturação externa que o TDAH precisa
- Ser prático: "faça isso agora" não "considere fazer"
- Nunca sugerir parar medicação sem acompanhamento médico
- Celebrar progresso: corrida como terapia é válido e poderoso
- Usar técnicas de TCC adaptadas quando relevante`;

function getSystemPrompt(intencao) {
  if (intencao === "treino" || intencao === "periodizacao") return SYSTEM_TREINO;
  if (intencao === 'lesao') return SYSTEM_LESAO;
  if (intencao === 'nutricao') return SYSTEM_NUTRICAO;
  if (intencao === 'motivacao') return SYSTEM_MOTIVACAO;
  if (intencao === 'zonas') return SYSTEM_ZONAS;
  if (intencao === 'longevidade') return SYSTEM_LONGEVIDADE;
  if (intencao === 'medico') return SYSTEM_MEDICO;
  if (intencao === 'nutricionista') return SYSTEM_NUTRICIONISTA;
  if (intencao === 'psicologo') return SYSTEM_PSICOLOGO;
  return SYSTEM_BASE;
}

// ==================== MENSAGEM DE UPSELL PREMIUM ====================

function getMensagemRateLimit(nome) {
  const msgs = [
    `${nome}, suas 5 mensagens gratuitas desta hora acabaram! 😅\n\n🏆 Com o **PACE Premium** (R$29,90/mês) você tem:\n- 60 mensagens/hora com a IA Treinadora\n- Planilha semanal personalizada com zonas FC e pace\n- Análise completa do seu perfil de corredor\n- Chance de pódio na sua faixa etária\n\n👉 Quer desbloquear agora? Acesse "Meu Perfil" → "Seja Premium"`,
    `Eii ${nome}! Você curtiu conversar comigo, né? 🏃‍♂️\n\nSuas 5 msgs free acabaram, mas no **Premium** eu fico disponível pra te ajudar MUITO mais:\n- Planilhas com zonas de FC calculadas pela fórmula Karvonen\n- Paces personalizados pelo método Daniels (VDOT)\n- 60 msgs por hora!\n\nSó R$29,90/mês — menos que um gel de corrida por dia! 💚`,
    `${nome}, a gente tava indo tão bem! 💪\n\nSuas mensagens gratuitas acabaram. Com o **PACE Premium** eu posso:\n- Montar treinos com base nos seus dados REAIS de FC e pace\n- Gerar planilha semanal completa\n- Analisar seu histórico e traçar metas de 90 dias\n\nR$29,90/mês → Vá em "Perfil" → "Premium" 🚀`
  ];
  return msgs[Math.floor(Math.random() * msgs.length)];
}

// ==================== CONTEXTO RICO DO ATLETA ====================

async function buscarProximasCorridas(estado = 'SE', limite = 4) {
  try {
    const corridas = await prisma.corridaAberta.findMany({
      where: { ativa: true, data: { gte: new Date() }, estado },
      orderBy: { data: 'asc' }, take: limite,
      select: { nome: true, data: true, cidade: true, distancias: true }
    });
    return corridas.map(c =>
      `📍 ${c.nome} | ${new Date(c.data).toLocaleDateString('pt-BR')} | ${c.cidade} | ${c.distancias}`
    ).join('\n');
  } catch { return ''; }
}

async function montarContexto(userId, contextoLoja, intencao) {
  const [user, avatar, perfil, resultados, atividades] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true, city: true, state: true, age: true, gender: true,
        fcMax: true, fcRepouso: true,
        tempo5k: true, tempo10k: true, tempo21k: true, tempo42k: true,
        nivelAtleta: true, bio: true
      }
    }),
    prisma.atletaAvatar.findUnique({ where: { userId } }).catch(() => null),
    prisma.iaPerfilCorredor.findUnique({ where: { userId } }).catch(() => null),
    prisma.result.findMany({
      where: { athlete: { user: { id: userId } } },
      include: { race: { select: { name: true, date: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5
    }).catch(() => []),
    prisma.atividadeGPS.findMany({
      where: { userId },
      orderBy: { iniciadoEm: 'desc' },
      take: 8,
      select: {
        tipo: true, distanciaKm: true, duracaoSeg: true, paceMedio: true,
        elevacaoGanho: true, temperatura: true, iniciadoEm: true, fonte: true
      }
    }).catch(() => []),
  ]);

  // === VDOT e Paces Daniels ===
  let vdot = null;
  let pacesDaniels = null;
  const temposRef = [
    { dist: 5, tempo: user?.tempo5k },
    { dist: 10, tempo: user?.tempo10k },
    { dist: 21.1, tempo: user?.tempo21k },
    { dist: 42.2, tempo: user?.tempo42k },
  ].filter(t => t.tempo);

  // Usa o melhor VDOT entre os tempos de prova registrados
  for (const t of temposRef) {
    const seg = tempoParaSeg(t.tempo);
    const v = calcularVDOT(t.dist, seg);
    if (v && (!vdot || v > vdot)) vdot = v;
  }

  // Também calcula VDOT a partir dos resultados oficiais
  for (const r of resultados) {
    const d = parseFloat(r.distance);
    const seg = tempoParaSeg(r.time);
    if (d && seg) {
      const v = calcularVDOT(d, seg);
      if (v && (!vdot || v > vdot)) vdot = v;
    }
  }

  if (vdot) pacesDaniels = calcularPacesDaniels(vdot);

  // === Zonas de FC (Karvonen) ===
  const zonas = calcularZonasKarvonen(user?.fcMax, user?.fcRepouso);

  // === Nível com VDOT ===
  const nivel = calcularNivel(resultados, vdot);

  // === Melhores tempos ===
  const melhores = {};
  for (const r of resultados) {
    const d = r.distance || 'outros';
    const seg = tempoParaSeg(r.time);
    if (seg && (!melhores[d] || seg < melhores[d].seg)) {
      melhores[d] = { tempo: r.time, seg, prova: r.race?.name, data: r.race?.date };
    }
  }

  // === Volume e tendência das atividades GPS ===
  let volumeSemana = 0, volumeMes = 0, atividadesSemana = 0;
  const agora = Date.now();
  const umaSemana = 7 * 24 * 60 * 60 * 1000;
  const umMes = 30 * 24 * 60 * 60 * 1000;

  for (const a of atividades) {
    const diff = agora - new Date(a.iniciadoEm).getTime();
    if (diff < umaSemana) {
      volumeSemana += a.distanciaKm || 0;
      atividadesSemana++;
    }
    if (diff < umMes) {
      volumeMes += a.distanciaKm || 0;
    }
  }

  // Pace médio das últimas atividades
  const pacesRecentes = atividades
    .filter(a => a.paceMedio && a.tipo === 'corrida')
    .slice(0, 5)
    .map(a => a.paceMedio);

  // === MONTAGEM DO CONTEXTO ===
  const linhas = [
    '═══════════════ DADOS DO ATLETA ═══════════════',
    `NOME: ${user?.name || 'Atleta'}`,
    user?.age ? `IDADE: ${user.age} anos` : '',
    user?.gender ? `SEXO: ${user.gender}` : '',
    user?.city ? `LOCAL: ${user.city}${user.state ? '/' + user.state : ''}` : '',

    // Dados fisiológicos
    vdot ? `\nVDOT (Daniels): ${vdot} → Nível: ${nivel.toUpperCase()}` : `\nNÍVEL: ${nivel}`,

    // Zonas de FC
    zonas ? [
      '\n── ZONAS DE FC (Karvonen) ──',
      `FC Max: ${zonas.fcMax} bpm | FC Repouso: ${zonas.fcRepouso} bpm | Reserva: ${zonas.reserva} bpm`,
      `Z1 Recuperação:  ${zonas.z1.texto} → ${zonas.z1.adaptacao}`,
      `Z2 Base Aeróbica: ${zonas.z2.texto} → ${zonas.z2.adaptacao}`,
      `Z3 Limiar:       ${zonas.z3.texto} → ${zonas.z3.adaptacao}`,
      `Z4 VO2max:       ${zonas.z4.texto} → ${zonas.z4.adaptacao}`,
      `Z5 Anaeróbico:   ${zonas.z5.texto} → ${zonas.z5.adaptacao}`,
    ].join('\n') : (user?.fcMax ? `FC Max: ${user.fcMax} bpm` : '⚠️ SEM FC MÁXIMA — peça ao atleta para cadastrar'),

    // Paces Daniels
    pacesDaniels ? [
      '\n── PACES DE TREINO (Daniels/VDOT) ──',
      `Easy (trote):      ${pacesDaniels.easy}/km`,
      `Marathon:           ${pacesDaniels.marathon}/km`,
      `Threshold (limiar): ${pacesDaniels.threshold}/km`,
      `Interval (VO2max):  ${pacesDaniels.interval}/km`,
      `Repetition (sprint): ${pacesDaniels.repetition}/km`,
    ].join('\n') : '',

    // PRs
    Object.keys(melhores).length ? [
      '\n── MELHORES TEMPOS (PR) ──',
      ...Object.entries(melhores).map(([d, v]) =>
        `${d}: ${v.tempo}${v.prova ? ` (${v.prova})` : ''}${v.data ? ` em ${new Date(v.data).toLocaleDateString('pt-BR')}` : ''}`
      )
    ].join('\n') : '',

    // Tempos registrados no perfil
    (user?.tempo5k || user?.tempo10k || user?.tempo21k || user?.tempo42k) ? [
      '\n── TEMPOS REGISTRADOS ──',
      user.tempo5k ? `5K: ${user.tempo5k}` : '',
      user.tempo10k ? `10K: ${user.tempo10k}` : '',
      user.tempo21k ? `21K: ${user.tempo21k}` : '',
      user.tempo42k ? `42K: ${user.tempo42k}` : '',
    ].filter(Boolean).join('\n') : '',

    // Volume
    atividades.length ? [
      '\n── VOLUME E ATIVIDADE ──',
      `Semana atual: ${volumeSemana.toFixed(1)}km em ${atividadesSemana} treinos`,
      `Último mês: ${volumeMes.toFixed(1)}km`,
      `Total de provas oficiais: ${resultados.length}`,
      pacesRecentes.length ? `Paces recentes (últimos treinos): ${pacesRecentes.join(', ')}/km` : '',
    ].filter(Boolean).join('\n') : `\nTOTAL DE PROVAS: ${resultados.length}`,

    // Dados corporais
    avatar?.altura ? `\n── CORPO ──\n${avatar.altura}cm, ${avatar.peso || '?'}kg${avatar.manequim ? ', Tamanho ' + avatar.manequim : ''}` : '',

    // Perfil psicológico/objetivos
    perfil?.objetivos ? `\n── OBJETIVOS ──\n${perfil.objetivos.substring(0, 200)}` : '',
    perfil?.biologico ? `\n── HISTÓRICO SAÚDE ──\n${perfil.biologico.substring(0, 150)}` : '',
    perfil?.psicologico ? `\n── PERFIL MENTAL ──\n${perfil.psicologico.substring(0, 150)}` : '',
    perfil?.funcional ? `\n── FUNCIONAL ──\n${perfil.funcional.substring(0, 150)}` : '',

    // Contexto loja
    contextoLoja ? '\n⚠️ CONTEXTO: atleta está na loja querendo comprar camisa' : '',

    // Corridas próximas
    intencao === 'eventos' ? `\n── PRÓXIMAS CORRIDAS ──\n${await buscarProximasCorridas(user?.state || 'SE')}` : '',
  ].filter(Boolean).join('\n');

  return { ctx: linhas, user, nivel, vdot, pacesDaniels, zonas };
}

// ==================== ROTAS ====================

export async function iaRoutes(fastify) {

  // ==================== CHAT PRINCIPAL ====================
  fastify.post('/ia/chat', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });

    // Verificar Premium
    const userDb = await prisma.user.findUnique({
      where: { id: u.userId },
      select: { isPremium: true, premiumUntil: true, name: true }
    }).catch(() => null);
    const isPremium = userDb?.isPremium && (!userDb.premiumUntil || new Date(userDb.premiumUntil) > new Date());

    // Rate limit — FIX: retorna mensagem de upsell em vez de vazio
    const rate = checkIaRateLimit(u.userId, isPremium);
    if (!rate.ok) {
      return reply.code(200).send({
        resposta: getMensagemRateLimit(userDb?.name || 'Atleta'),
        intencao: 'upsell',
        nivel: null,
        restantes: 0,
        isPremium: false,
        upsell: true
      });
    }

    const { mensagem, contextoLoja } = req.body || {};
    if (!mensagem?.trim()) return reply.code(400).send({ error: 'Mensagem vazia' });
    if (mensagem.length > 1000) return reply.code(400).send({ error: 'Mensagem muito longa (máx 1000 caracteres)' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { resposta: 'Estou descansando! Em breve volto para te ajudar. 🏃💚', restantes: rate.restantes };

    try {
      const intencao = detectarIntencao(mensagem);
      const system = getSystemPrompt(intencao);
      const { ctx, user, nivel, vdot, pacesDaniels, zonas } = await montarContexto(u.userId, contextoLoja, intencao);

      const conversa = await prisma.iaConversa.findUnique({ where: { userId: u.userId } }).catch(() => null);
      let historico = [];
      try { if (conversa?.mensagens) historico = JSON.parse(conversa.mensagens).slice(-6); } catch {}

      const perfil = await prisma.iaPerfilCorredor.findUnique({ where: { userId: u.userId } }).catch(() => null);

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 700,
          system,
          messages: [
            ...historico,
            { role: 'user', content: `[DADOS DO ATLETA]\n${ctx}\n\n[MENSAGEM DO ATLETA]\n${mensagem}` }
          ],
        })
      });

      const data = await resp.json();
      if (data.error) {
        console.error('[IA ERROR]', JSON.stringify(data.error));
        return { resposta: 'Dificuldade técnica agora. Tente em instantes! 💚', restantes: rate.restantes };
      }

      const resposta = data.content?.[0]?.text || 'Erro ao processar!';

      // Salvar histórico
      const novoHist = [...historico, { role: 'user', content: mensagem }, { role: 'assistant', content: resposta }].slice(-12);
      const histStr = JSON.stringify(novoHist);
      if (conversa) {
        await prisma.iaConversa.update({ where: { userId: u.userId }, data: { mensagens: histStr } });
      } else {
        await prisma.iaConversa.create({ data: { userId: u.userId, mensagens: histStr } });
      }

      // Atualizar perfil e comportamento em background
      atualizarPerfil(u.userId, mensagem, perfil).catch(() => {});
      registrarComportamento(u.userId, intencao, mensagem).catch(() => {});

      return {
        resposta,
        intencao,
        nivel,
        restantes: rate.restantes,
        vdot: vdot || undefined,
        isPremium
      };

    } catch (e) {
      console.error('[IA CATCH]', e.message);
      return { resposta: 'Erro interno. Tente novamente!', restantes: rate.restantes };
    }
  });

  // ==================== ANÁLISE COMPLETA (PREMIUM) ====================
  fastify.post('/ia/analise-completa', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return reply.code(503).send({ error: 'IA não configurada' });

    try {
      const { ctx, user, vdot, pacesDaniels, zonas } = await montarContexto(u.userId, false, 'treino');
      const corridas = await buscarProximasCorridas(user?.state || 'SE', 6);

      const prompt = `${ctx}\n\nPRÓXIMAS CORRIDAS:\n${corridas}\n\nGere uma ANÁLISE PROFISSIONAL COMPLETA usando todos os dados acima. Estruture assim:

## 1. 🏃 Perfil do Atleta
- VDOT, nível, pontos fortes e fracos baseados nos dados

## 2. 📊 Zonas de Treino Personalizadas
- Tabela de zonas FC (Karvonen) — use os dados de FC do atleta
- Tabela de paces (Daniels) — calculados do VDOT

## 3. 🎯 Meta Realista em 90 Dias
- Tempo-alvo específico para a distância-foco
- VDOT alvo e o que precisa para chegar lá

## 4. 📅 Plano Semanal Modelo
- 7 dias em tabela com tipo, volume, zona FC, pace, e POR QUÊ cada sessão

## 5. 🍌 Nutrição Periodizada
- Dia de treino intenso vs dia de descanso
- Pré/durante/pós adaptados ao calor brasileiro

## 6. 🏁 Próximas Corridas Recomendadas
- Com sugestão de qual usar como prova-alvo e quais como preparatórias

## 7. 💪 Plano de Ação — Próximos 30 Dias
- 3 ações concretas que o atleta deve fazer ESTA semana`;

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1200,
          system: SYSTEM_TREINO,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await resp.json();
      return {
        analise: data.content?.[0]?.text || 'Erro ao gerar análise.',
        atleta: user?.name,
        vdot: vdot || undefined,
        geradoEm: new Date().toISOString()
      };
    } catch (e) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // ==================== CHANCE DE PÓDIO (PREMIUM) ====================
  fastify.post('/ia/chance-podio', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return reply.code(503).send({ error: 'IA não configurada' });

    const { distancia } = req.body || {};

    try {
      const user = await prisma.user.findUnique({
        where: { id: u.userId },
        select: { name: true, age: true, gender: true, tempo5k: true, tempo10k: true, fcMax: true }
      });
      const meusResultados = await prisma.result.findMany({
        where: { athlete: { user: { id: u.userId } }, ...(distancia ? { distance: { contains: distancia } } : {}) },
        orderBy: { createdAt: 'desc' }, take: 5
      }).catch(() => []);

      const faixaMin = user?.age ? user.age - (user.age % 5) : 30;
      const faixaMax = faixaMin + 4;

      const atletasFaixa = await prisma.athlete.findMany({
        where: { age: { gte: faixaMin, lte: faixaMax } },
        include: { results: { where: distancia ? { distance: { contains: distancia } } : {}, orderBy: { createdAt: 'desc' }, take: 1 } },
        take: 50
      }).catch(() => []);

      const temposFaixa = atletasFaixa.map(a => a.results?.[0]?.time).filter(Boolean).sort();
      const meuMelhor = meusResultados[0]?.time || null;

      let minhaPos = 1;
      if (meuMelhor) {
        const meuSeg = tempoParaSeg(meuMelhor);
        for (const t of temposFaixa) { if (tempoParaSeg(t) < meuSeg) minhaPos++; }
      }

      // Calcular VDOT do melhor tempo
      const distKm = parseFloat(distancia) || 10;
      const meuVdot = meuMelhor ? calcularVDOT(distKm, tempoParaSeg(meuMelhor)) : null;

      const prompt = `ATLETA: ${user?.name} | ${user?.age} anos | Faixa ${faixaMin}-${faixaMax} | ${user?.gender || '?'}
MEU MELHOR (${distancia || 'geral'}): ${meuMelhor || 'sem registro'}
MEU VDOT: ${meuVdot || 'não calculado'}
POSIÇÃO ESTIMADA: ${minhaPos}º de ${temposFaixa.length} na faixa etária
TOP 5 DA FAIXA: ${temposFaixa.slice(0, 5).join(', ') || 'dados insuficientes'}

Responda com análise profissional:
1. **Posição atual** na faixa etária — contextualize
2. **Chance real de pódio** — qual tempo preciso atingir? Qual VDOT necessário?
3. **Plano de ataque** — quanto tempo de treino consistente e que tipo de sessões
4. **A sessão mais importante** — descreva 1 treino-chave com detalhes (pace, séries, recuperação)`;

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, system: SYSTEM_TREINO, messages: [{ role: 'user', content: prompt }] })
      });

      const data = await resp.json();
      return {
        analise: data.content?.[0]?.text,
        minhaPos,
        totalNaFaixa: temposFaixa.length,
        meuMelhorTempo: meuMelhor,
        vdot: meuVdot,
        faixaEtaria: `${faixaMin}-${faixaMax}`
      };
    } catch (e) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // ==================== DICA DO DIA ====================
  fastify.get('/ia/dica-do-dia', async (req, reply) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { dica: 'Configure ANTHROPIC_API_KEY!', tema: 'config' };

    const temas = [
      'treino de velocidade — por que intervalos de VO2max são o investimento mais eficiente do corredor',
      'nutrição pré-prova — o que comer nas últimas 24h antes de uma corrida de 10K',
      'recuperação muscular — por que o descanso é onde você REALMENTE fica mais forte',
      'mentalidade de corredor — como usar metas A/B/C para eliminar ansiedade pré-prova',
      'técnica de corrida — cadência ideal de 170-180ppm e por que importa',
      'hidratação no calor — ciência da reposição de eletrólitos para o clima brasileiro',
      'corrida fácil — por que 80% do treino em Z1-Z2 é o segredo dos quenianos'
    ];
    const tema = temas[new Date().getDay() % temas.length];
    const dia = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 150, system: SYSTEM_BASE,
          messages: [{
            role: 'user',
            content: `É ${dia} no Brasil, calor tropical. Dê UMA dica prática e CIENTÍFICA sobre: ${tema}.
Formato: 3-4 linhas, 1 emoji, tom de coach confiante. Inclua UM dado concreto (número, estudo, ou referência à fisiologia). Seja específica — nunca genérica.`
          }]
        })
      });
      const data = await resp.json();
      return { dica: data.content?.[0]?.text || 'Bora correr! 🏃', tema, dia };
    } catch {
      return { dica: 'Hoje treine LEVE — Z1-Z2. É na corrida fácil que seu corpo constrói mitocôndrias novas e capilares. Os quenianos passam 85% do tempo treinando devagar. Confie no processo. 💚', tema, dia };
    }
  });

  // ==================== CALCULAR PACE ====================
  fastify.post('/ia/calcular-pace', async (req, reply) => {
    const { distancia, tempoAtual, objetivo, nivel } = req.body || {};
    if (!distancia) return reply.code(400).send({ error: 'Distância obrigatória' });

    let paceAtual = null;
    const distKm = parseFloat(distancia);
    const seg = tempoParaSeg(tempoAtual);

    if (seg && distKm) {
      const ps = seg / distKm;
      paceAtual = `${Math.floor(ps / 60)}:${String(Math.round(ps % 60)).padStart(2, '0')}/km`;
    }

    // Calcular VDOT e zonas de pace
    const vdot = (seg && distKm) ? calcularVDOT(distKm, seg) : null;
    const paces = vdot ? calcularPacesDaniels(vdot) : null;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { paceAtual, vdot, paces, aviso: 'IA não configurada' };

    try {
      const prompt = `Distância: ${distancia}km | Tempo: ${tempoAtual || 'não informado'} | Objetivo: ${objetivo || 'melhorar'}
${paceAtual ? `Pace atual: ${paceAtual}` : ''}
${vdot ? `VDOT calculado: ${vdot}` : ''}
${paces ? `Zonas Daniels — Easy: ${paces.easy}, Marathon: ${paces.marathon}, Threshold: ${paces.threshold}, Interval: ${paces.interval}, Rep: ${paces.repetition}` : ''}

Com base nesses dados:
1. Análise do pace atual e o que significa em termos de VDOT
2. Zonas de treino em tabela (pace + para que serve)
3. 3 sessões-chave desta semana com paces exatos e explicação fisiológica
4. Meta realista para os próximos 8 semanas`;

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 450, system: SYSTEM_TREINO,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await resp.json();
      return { paceAtual, vdot, paces, analise: data.content?.[0]?.text, distancia, tempoAtual };
    } catch (e) {
      return { paceAtual, vdot, paces, erro: e.message };
    }
  });

  // ==================== PLANILHA SEMANAL (PREMIUM) ====================
  fastify.post('/ia/planilha', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessario' });
    const userDb = await prisma.user.findUnique({
      where: { id: u.userId },
      select: {
        isPremium: true, premiumUntil: true, name: true,
        tempo5k: true, tempo10k: true, fcMax: true, fcRepouso: true,
        nivelAtleta: true, city: true, state: true, age: true
      }
    });
    const isPremium = userDb?.isPremium && (!userDb.premiumUntil || new Date(userDb.premiumUntil) > new Date());
    if (!isPremium) return reply.code(403).send({ error: 'Exclusivo Premium!', isPremium: false });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return reply.code(500).send({ error: 'IA indisponivel' });

    const { objetivo, observacoes } = req.body || {};

    // Calcular VDOT e zonas
    let vdot = null;
    if (userDb?.tempo5k) vdot = calcularVDOT(5, tempoParaSeg(userDb.tempo5k));
    if (!vdot && userDb?.tempo10k) vdot = calcularVDOT(10, tempoParaSeg(userDb.tempo10k));

    const paces = vdot ? calcularPacesDaniels(vdot) : null;
    const zonas = calcularZonasKarvonen(userDb?.fcMax, userDb?.fcRepouso);

    // Buscar volume recente
    const atividades = await prisma.atividadeGPS.findMany({
      where: { userId: u.userId, iniciadoEm: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      select: { distanciaKm: true }
    }).catch(() => []);
    const volMensal = atividades.reduce((s, a) => s + (a.distanciaKm || 0), 0);
    const volSemanal = Math.round(volMensal / 4);

    const prompt = `Gere uma PLANILHA SEMANAL PROFISSIONAL de corrida.

ATLETA: ${userDb?.name}, ${userDb?.age || '?'} anos, ${userDb?.city || '?'}/${userDb?.state || '?'}
NÍVEL: ${userDb?.nivelAtleta || 'iniciante'}
VDOT: ${vdot || 'não calculado'}
5km: ${userDb?.tempo5k || '?'} | 10km: ${userDb?.tempo10k || '?'}

${zonas ? `ZONAS FC (Karvonen):
Z1: ${zonas.z1.texto} (Recuperação)
Z2: ${zonas.z2.texto} (Base Aeróbica)
Z3: ${zonas.z3.texto} (Limiar)
Z4: ${zonas.z4.texto} (VO2max)
Z5: ${zonas.z5.texto} (Anaeróbico)` : 'SEM DADOS DE FC'}

${paces ? `PACES (Daniels):
Easy: ${paces.easy}/km | Marathon: ${paces.marathon}/km
Threshold: ${paces.threshold}/km | Interval: ${paces.interval}/km | Rep: ${paces.repetition}/km` : 'SEM DADOS DE PACE'}

VOLUME ATUAL: ~${volSemanal}km/semana (último mês: ${volMensal.toFixed(0)}km)
OBJETIVO: ${objetivo || 'Melhorar performance geral'}
OBS: ${observacoes || 'nenhuma'}

Gere 7 dias em tabela:
| Dia | Sessão | Detalhamento | Volume | Zona FC | Pace | Por quê (adaptação fisiológica) |

Regras:
- NUNCA dois dias intensos consecutivos
- ~80% do volume em Z1-Z2
- Aumento de volume máx 10% sobre o atual
- Inclua strides 2x na semana (educativos neuromusculares)
- Após a tabela, escreva 1 parágrafo explicando a lógica da semana`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1200,
          system: SYSTEM_TREINO,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await res.json();
      return { success: true, planilha: data.content?.[0]?.text || 'Erro', isPremium: true, vdot };
    } catch (e) {
      return reply.code(500).send({ error: 'Erro ao gerar planilha' });
    }
  });

  // ==================== HISTÓRICO ====================
  fastify.get('/ia/historico', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const conv = await prisma.iaConversa.findUnique({ where: { userId: u.userId } }).catch(() => null);
    if (!conv) return { mensagens: [] };
    try { return { mensagens: JSON.parse(conv.mensagens) }; }
    catch { return { mensagens: [] }; }
  });

  fastify.delete('/ia/historico', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    await prisma.iaConversa.deleteMany({ where: { userId: u.userId } }).catch(() => {});
    return { success: true };
  });

  // ==================== AVATAR ====================
  fastify.post('/ia/avatar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const { altura, peso, medidaTorax, medidaOmbro, tipoCorpo, fotoEvento } = req.body || {};

    let manequim = null;
    const torax = parseFloat(medidaTorax);
    if (torax) {
      if (torax < 86) manequim = 'PP';
      else if (torax < 92) manequim = 'P';
      else if (torax < 98) manequim = 'M';
      else if (torax < 104) manequim = 'G';
      else if (torax < 110) manequim = 'GG';
      else manequim = 'XG';
    }

    const data = {
      altura: altura ? parseInt(altura) : null,
      peso: peso ? parseFloat(peso) : null,
      medidaTorax: torax || null,
      medidaOmbro: medidaOmbro ? parseFloat(medidaOmbro) : null,
      tipoCorpo: tipoCorpo || null,
      fotoEvento: fotoEvento || null,
      manequim,
      updatedAt: new Date(),
    };

    const existe = await prisma.atletaAvatar.findUnique({ where: { userId: u.userId } }).catch(() => null);
    if (existe) {
      await prisma.atletaAvatar.update({ where: { userId: u.userId }, data });
    } else {
      await prisma.atletaAvatar.create({ data: { ...data, userId: u.userId } });
    }
    return { success: true, manequim };
  });

  fastify.get('/ia/avatar', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const av = await prisma.atletaAvatar.findUnique({ where: { userId: u.userId } }).catch(() => null);
    return av || {};
  });

  // ==================== PERFIL IA ====================
  fastify.get('/ia/perfil', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const p = await prisma.iaPerfilCorredor.findUnique({ where: { userId: u.userId } }).catch(() => null);
    return p || {};
  });

  // ==================== COMPORTAMENTO ====================
  fastify.get('/ia/comportamento', async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: 'Login necessário' });
    const dados = await prisma.comportamentoCorredor.findMany({
      where: { userId: u.userId }, orderBy: { criadoEm: 'desc' }, take: 30
    }).catch(() => []);
    return dados;
  });

  // ==================== STATUS ====================
  fastify.get('/ia/status', async (req, reply) => {
    const u = getUser(req);
    if (!u) return { ativa: false, isPremium: false };
    const userDb = await prisma.user.findUnique({
      where: { id: u.userId },
      select: { isPremium: true, premiumUntil: true, name: true, tempo5k: true, fcMax: true, nivelAtleta: true }
    });
    const isPremium = userDb?.isPremium && (!userDb.premiumUntil || new Date(userDb.premiumUntil) > new Date());

    // Calcular VDOT para exibir no status
    let vdot = null;
    if (userDb?.tempo5k) vdot = calcularVDOT(5, tempoParaSeg(userDb.tempo5k));

    return {
      ativa: !!process.env.ANTHROPIC_API_KEY,
      isPremium,
      nome: userDb?.name,
      nivel: userDb?.nivelAtleta || 'iniciante',
      vdot,
      recursos: {
        chat: true,
        planilhaSemanal: isPremium,
        analiseCompleta: isPremium,
        chancePodio: isPremium,
        msgsHora: isPremium ? 60 : 5
      }
    };
  });
}

// ==================== FUNÇÕES AUXILIARES ====================

async function atualizarPerfil(userId, msg, perfilAtual) {
  const t = msg.toLowerCase();
  const up = {};
  const ts = new Date().toLocaleDateString('pt-BR');
  const txt = msg.substring(0, 120);

  if (/lesão|dor |machuc|médico|joelho|tornozelo|fascite|canelite/.test(t))
    up.biologico = ((perfilAtual?.biologico || '') + ` | ${ts}: ${txt}`).slice(-500);
  if (/quero|meta|objetivo|correr.*km|maratona|meia|sub-/.test(t))
    up.objetivos = ((perfilAtual?.objetivos || '') + ` | ${txt}`).slice(-500);
  if (/motivaç|desistir|difícil|orgulho|feliz|triste|cansado/.test(t))
    up.psicologico = ((perfilAtual?.psicologico || '') + ` | ${ts}: ${txt}`).slice(-500);
  if (/grupo|assessoria|amigo|turma|clube|pace/.test(t))
    up.social = ((perfilAtual?.social || '') + ` | ${txt}`).slice(-500);
  if (/grat|propós|fé |deus|espirit|sentido/.test(t))
    up.espiritual = ((perfilAtual?.espiritual || '') + ` | ${txt}`).slice(-500);
  if (/calor|chuva|praia|trilha|pista|horário|manhã|tarde/.test(t))
    up.ambiental = ((perfilAtual?.ambiental || '') + ` | ${txt}`).slice(-500);
  if (/pace|vo2|zona|intervalo|limiar|threshold|fartlek|longão/.test(t))
    up.funcional = ((perfilAtual?.funcional || '') + ` | ${ts}: ${txt}`).slice(-500);

  if (!Object.keys(up).length) return;
  up.updatedAt = new Date();

  if (perfilAtual) {
    await prisma.iaPerfilCorredor.update({ where: { userId }, data: up });
  } else {
    await prisma.iaPerfilCorredor.create({ data: { userId, ...up } });
  }
}

async function registrarComportamento(userId, intencao, mensagem) {
  try {
    await prisma.comportamentoCorredor.create({
      data: {
        userId,
        intencao,
        topico: mensagem.substring(0, 100),
        hora: new Date().getHours(),
        diaSemana: new Date().getDay(),
        criadoEm: new Date(),
      }
    });
  } catch {}
}
