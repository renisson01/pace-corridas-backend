import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import prisma from "../../lib/prisma.js";

// Importar fetch e cheerio de forma compatível
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const cheerio = await import('cheerio');

// SITES SUPORTADOS E COMO EXTRAIR DADOS DE CADA UM
const PARSERS = {
  'sportschrono.com.br': parseSportsChrono,
  'leveyourun.com': parseLeveYouRun,
  'chipower.com.br': parseChiPower,
  'centraldasinscricoes.com.br': parseCentral,
  'centraldacorrida.com.br': parseCentral,
  'ticketsports.com.br': parseTicketSports,
  'sympla.com.br': parseSympla,
  'corridasdeboa.com.br': parseGenerico,
  'brasilcorrida.com.br': parseGenerico,
};

// Parser SportsChrono
async function parseSportsChrono(html, atletaNome) {
  const $ = cheerio.load(html);
  const resultados = [];
  
  // Buscar na tabela de resultados
  $('table tr, .result-row, .ranking-row').each((i, el) => {
    const texto = $(el).text().toLowerCase();
    const nomeNorm = atletaNome.toLowerCase().split(' ')[0];
    if (texto.includes(nomeNorm)) {
      const cells = $(el).find('td');
      if (cells.length >= 3) {
        resultados.push({
          posicao: $(cells[0]).text().trim(),
          nome: $(cells[1]).text().trim() || atletaNome,
          tempo: extrairTempo($(el).text()),
          pace: extrairPace($(el).text()),
        });
      }
    }
  });
  return resultados;
}

// Parser LeveYouRun
async function parseLeveYouRun(html, atletaNome) {
  const $ = cheerio.load(html);
  const resultados = [];
  const nomeNorm = atletaNome.toLowerCase().split(' ')[0];
  
  $('.result-item, .participant-row, tr').each((i, el) => {
    const texto = $(el).text().toLowerCase();
    if (texto.includes(nomeNorm)) {
      resultados.push({
        posicao: extrairPosicao($(el).text()),
        nome: atletaNome,
        tempo: extrairTempo($(el).text()),
        pace: extrairPace($(el).text()),
      });
    }
  });
  return resultados;
}

// Parser ChiPower
async function parseChiPower(html, atletaNome) {
  return parseGenerico(html, atletaNome);
}

// Parser Central Inscrições / Central da Corrida
async function parseCentral(html, atletaNome) {
  return parseGenerico(html, atletaNome);
}

// Parser TicketSports
async function parseTicketSports(html, atletaNome) {
  return parseGenerico(html, atletaNome);
}

// Parser Sympla
async function parseSympla(html, atletaNome) {
  return parseGenerico(html, atletaNome);
}

// Parser genérico - funciona em qualquer site
async function parseGenerico(html, atletaNome) {
  const $ = cheerio.load(html);
  const resultados = [];
  const nomeNorm = atletaNome.toLowerCase().split(' ')[0];
  
  // Tentar encontrar o nome em qualquer elemento
  $('tr, .row, .item, li, div').each((i, el) => {
    const texto = $(el).text();
    if (texto.toLowerCase().includes(nomeNorm) && texto.length < 500) {
      const tempo = extrairTempo(texto);
      if (tempo) {
        resultados.push({
          posicao: extrairPosicao(texto),
          nome: atletaNome,
          tempo,
          pace: extrairPace(texto),
        });
      }
    }
  });
  
  // Remover duplicatas
  return resultados.filter((r, i, arr) => 
    arr.findIndex(x => x.tempo === r.tempo) === i
  ).slice(0, 3);
}

// Extrair tempo de string (formatos: 2:12:45, 1:05:30, 45:22)
function extrairTempo(texto) {
  const match = texto.match(/\b(\d{1,2}:\d{2}:\d{2}|\d{2}:\d{2})\b/);
  return match ? match[0] : null;
}

// Extrair pace (formato: 4:30/km, 4'30"/km)
function extrairPace(texto) {
  const match = texto.match(/\b(\d:\d{2})\s*\/\s*km\b/i) || 
                texto.match(/\b(\d'\d{2}")\s*\/\s*km\b/i);
  return match ? match[0].replace('"','').replace("'",'') + '/km' : null;
}

// Extrair posição (1º, 2°, 1, 2, etc)
function extrairPosicao(texto) {
  const match = texto.match(/\b(\d+)[°º]?\b/);
  return match ? parseInt(match[1]) : null;
}

// Extrair informações da prova pela URL
function extrairInfoProva(url) {
  const urlObj = new URL(url);
  const path = urlObj.pathname.toLowerCase();
  
  // Tentar pegar nome da prova da URL
  const partes = path.split('/').filter(p => p.length > 2);
  const nomePath = partes[partes.length - 1]
    ?.replace(/-/g, ' ')
    ?.replace(/\d{4}/, '')
    ?.trim();

  // Detectar distância
  let distancia = null;
  if (path.includes('42') || path.includes('maratona')) distancia = '42km';
  else if (path.includes('21') || path.includes('meia')) distancia = '21km';
  else if (path.includes('10')) distancia = '10km';
  else if (path.includes('5')) distancia = '5km';

  return { nomePath, distancia };
}

// FUNÇÃO PRINCIPAL - Verificar resultado via URL
export async function verificarResultado(url, atletaNome, userId) {
  console.log(`[VERIFIER] Verificando: ${url} para ${atletaNome}`);
  
  try {
    // 1. Validar URL
    const urlObj = new URL(url);
    const dominio = urlObj.hostname.replace('www.', '');
    
    // 2. Buscar página
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PACE/1.0)' },
      timeout: 10000,
    });
    
    if (!response.ok) throw new Error(`Site retornou ${response.status}`);
    const html = await response.text();
    
    // 3. Escolher parser correto
    const parserFn = Object.entries(PARSERS).find(([k]) => dominio.includes(k))?.[1] || parseGenerico;
    const resultados = await parserFn(html, atletaNome);
    
    if (!resultados.length) {
      // Tentar busca mais ampla
      const $ = cheerio.load(html);
      const tituloProva = $('h1, h2, title').first().text().trim().substring(0, 100);
      return {
        success: false,
        message: `Não encontramos "${atletaNome}" nos resultados. Verifique se o link é da página de resultados e se seu nome está correto.`,
        tituloProva,
        sugestao: 'Certifique-se de que o link leva diretamente para a página de resultados da prova.'
      };
    }
    
    // 4. Extrair info da prova
    const { nomePath, distancia } = extrairInfoProva(url);
    const $ = cheerio.load(html);
    const tituloProva = $('h1, h2, .event-title, .race-name').first().text().trim() || nomePath || 'Corrida';
    
    return {
      success: true,
      resultados,
      tituloProva: tituloProva.substring(0, 100),
      distancia,
      url,
      dominio,
    };
    
  } catch(e) {
    return {
      success: false,
      message: `Erro ao acessar o link: ${e.message}`,
      sugestao: 'Verifique se o link está correto e acessível.'
    };
  }
}

// Salvar resultado verificado no banco
export async function salvarResultadoVerificado({ userId, tituloProva, distancia, tempo, posicao, pace, url, estado, cidade }) {
  // 1. Buscar ou criar corrida
  let corrida = await prisma.race.findFirst({
    where: { name: { contains: tituloProva.split(' ').slice(0,3).join(' '), mode: 'insensitive' } }
  });
  
  if (!corrida) {
    corrida = await prisma.race.create({
      data: {
        name: tituloProva,
        city: cidade || 'Brasil',
        state: estado || 'BR',
        date: new Date(),
        distances: distancia || 'A definir',
        organizer: 'Verificado pelo atleta',
        status: 'completed',
        registrationUrl: url,
      }
    });
  }

  // 2. Buscar usuário e atleta
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { athlete: true } });
  if (!user) throw new Error('Usuário não encontrado');

  let atleta = user.athlete;
  if (!atleta) {
    atleta = await prisma.athlete.create({
      data: {
        name: user.name,
        city: user.city || cidade || null,
        state: user.state || estado || null,
        gender: user.gender || null,
        age: user.age || null,
        totalRaces: 0,
        totalPoints: 0,
      }
    });
    await prisma.user.update({ where: { id: userId }, data: { athleteId: atleta.id } });
  }

  // 3. Verificar se resultado já existe
  const jaExiste = await prisma.result.findUnique({
    where: { athleteId_raceId: { athleteId: atleta.id, raceId: corrida.id } }
  });
  if (jaExiste) return { success: false, message: 'Você já cadastrou este resultado.' };

  // 4. Criar resultado
  const pontos = Math.max(100, 1000 - ((posicao || 100) - 1) * 10);
  await prisma.result.create({
    data: {
      athleteId: atleta.id,
      raceId: corrida.id,
      time: tempo,
      pace: pace || null,
      overallRank: posicao || null,
      distance: distancia || null,
      points: pontos,
    }
  });

  // 5. Atualizar totais do atleta
  const totalResults = await prisma.result.findMany({ where: { athleteId: atleta.id } });
  await prisma.athlete.update({
    where: { id: atleta.id },
    data: {
      totalRaces: totalResults.length,
      totalPoints: totalResults.reduce((s, r) => s + r.points, 0),
    }
  });

  // 6. Verificar medalhas
  await verificarMedalhas(userId, totalResults.length);

  return { success: true, message: 'Resultado confirmado e salvo!', pontos };
}

async function verificarMedalhas(userId, totalCorridas) {
  const existing = await prisma.medal.findMany({ where: { userId } });
  const tipos = existing.map(m => m.type);
  const add = [];
  
  if (totalCorridas >= 1 && !tipos.includes('first_race'))
    add.push({ type:'first_race', title:'Primeira Corrida!', desc:'Resultado verificado e confirmado', icon:'🏃' });
  if (totalCorridas >= 5 && !tipos.includes('races_5'))
    add.push({ type:'races_5', title:'Corredor', desc:'5 corridas no histórico', icon:'⚡' });
  if (totalCorridas >= 10 && !tipos.includes('races_10'))
    add.push({ type:'races_10', title:'Maratonista', desc:'10 corridas no histórico', icon:'🔥' });
  if (totalCorridas >= 50 && !tipos.includes('races_50'))
    add.push({ type:'races_50', title:'Elite', desc:'50 corridas!', icon:'🏆' });

  for (const m of add) await prisma.medal.create({ data: { userId, ...m } });
}
