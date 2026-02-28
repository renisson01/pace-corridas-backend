// Resultados verificados do CBAt - Fonte: cbat.org.br
// Inseridos manualmente após leitura das notícias oficiais

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const NOVOS_RESULTADOS = [
  // Maratona SP 2025 (29ª edição) - Permit CBAt Ouro 02/2025
  { atleta:'Ederson Vilela Pereira',        equipe:'EC Pinheiros/SP', genero:'M',
    prova:'29ª Maratona Internacional de São Paulo 2025', dist:'42km', tempo:'2:18:52', pos:4 },
  { atleta:'Melquisedeque Messias Ribeiro', equipe:'Independente/MG', genero:'M',
    prova:'29ª Maratona Internacional de São Paulo 2025', dist:'42km', tempo:'2:19:23', pos:5 },
  { atleta:'Eulalia dos Santos',            equipe:'Independente',    genero:'F',
    prova:'29ª Maratona Internacional de São Paulo 2025', dist:'42km', tempo:'2:57:08', pos:4 },
  { atleta:'Juliana Pereira da Silva',      equipe:'Independente',    genero:'F',
    prova:'29ª Maratona Internacional de São Paulo 2025', dist:'42km', tempo:'2:58:40', pos:5 },

  // Maratona Rio 2025 (22/06/2025) - Permit 15/2025 Selo Ouro
  { atleta:'Justino Pedro da Silva',        equipe:'APA Petrolina/PE', genero:'M',
    prova:'Maratona da Cidade do Rio de Janeiro 2025', dist:'42km', tempo:'2:19:35', pos:3 },
  { atleta:'Amanda Aparecida de Oliveira',  equipe:'Elite Runners/RJ', genero:'F',
    prova:'Maratona da Cidade do Rio de Janeiro 2025', dist:'42km', tempo:'2:39:18', pos:2 },

  // Maratona Brasília 2024 - Permit 29/2024 Selo Prata
  { atleta:'Renilson Vitorino da Silva',    equipe:'Independente',    genero:'M',
    prova:'Maratona Monumental de Brasília 2024', dist:'42km', tempo:'2:26:16', pos:1 },
  { atleta:'Rejane Ester Bispo da Silva',   equipe:'Independente',    genero:'F',
    prova:'Maratona Monumental de Brasília 2024', dist:'42km', tempo:'2:57:37', pos:1 },

  // Sul-Americano Corridas de Rua 2025 (dentro da Meia Maratona Rio - Permit 21/2025)
  { atleta:'Fábio Jesus Correia',           equipe:'Kiatleta/SP',     genero:'M',
    prova:'Sul-Americano de Corridas de Rua - Meia Maratona 2025', dist:'21km', tempo:'1:02:09', pos:1 },
  { atleta:'Nubia de Oliveira Silva',       equipe:'Praia Clube/MG',  genero:'F',
    prova:'Sul-Americano de Corridas de Rua - Meia Maratona 2025', dist:'21km', tempo:'1:14:00', pos:1 },

  // Maratona do Litoral 2025 - Permit 23/2025 Selo Ouro
  { atleta:'Ederson Vilela Pereira',        equipe:'EC Pinheiros/SP', genero:'M',
    prova:'Maratona do Litoral 2025', dist:'42km', tempo:'2:20:52', pos:1 },
];

function pts(pos, dist) {
  const base = dist.includes('42') ? 5000 : dist.includes('21') ? 3000 : 2000;
  return Math.max(50, base - (pos - 1) * 300);
}

async function run() {
  console.log('🏆 Inserindo novos resultados verificados do CBAt 2025...\n');
  let inseridos = 0;

  for (const r of NOVOS_RESULTADOS) {
    // Buscar ou criar atleta
    let atleta = await p.athlete.findFirst({ where: { name: { equals: r.atleta, mode:'insensitive' } } });
    if (!atleta) {
      atleta = await p.athlete.create({ data: { name: r.atleta, equipe: r.equipe, gender: r.genero, totalRaces:0, totalPoints:0 } });
      console.log(`  ➕ Novo atleta: ${r.atleta}`);
    }

    // Buscar ou criar corrida
    let corrida = await p.race.findFirst({ where: { name: { contains: r.prova.substring(0,20), mode:'insensitive' } } });
    if (!corrida) {
      const ano = r.prova.match(/\d{4}/)?.[0] || '2025';
      corrida = await p.race.create({ data: { name: r.prova, city:'Brasil', state:'BR', date: new Date(`${ano}-06-01`), distances: r.dist, organizer:'Oficial', status:'completed' } });
    }

    // Verificar se resultado já existe
    const existe = await p.result.findUnique({ where: { athleteId_raceId: { athleteId: atleta.id, raceId: corrida.id } } });
    if (existe) { console.log(`  ⏭️  Já existe: ${r.atleta} - ${r.prova}`); continue; }

    // Inserir resultado
    await p.result.create({ data: { athleteId: atleta.id, raceId: corrida.id, time: r.tempo, overallRank: r.pos, distance: r.dist, points: pts(r.pos, r.dist) } });
    inseridos++;
    console.log(`  ✅ ${r.atleta} — ${r.prova} (${r.tempo}, ${r.pos}º)`);

    // Atualizar totais do atleta
    const all = await p.result.findMany({ where: { athleteId: atleta.id } });
    await p.athlete.update({ where: { id: atleta.id }, data: { totalRaces: all.length, totalPoints: all.reduce((s,x)=>s+x.points,0) } });
  }

  console.log(`\n✅ ${inseridos} novos resultados inseridos`);
  console.log('\n🏆 TOP 10 ATUALIZADO:');
  const top = await p.athlete.findMany({ orderBy:{totalPoints:'desc'}, take:10 });
  top.forEach((a,i) => console.log(`  ${i+1}. ${a.name.padEnd(38)} ${a.totalPoints}pts`));
  await p.$disconnect();
}

run().catch(console.error);
