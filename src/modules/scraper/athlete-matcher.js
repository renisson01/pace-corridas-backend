import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

// SISTEMA DE DEDUPLICAÇÃO DE ATLETAS
// Lógica: mesmo atleta = data nascimento + cidade similares
// Nome pode variar (João Silva, J. Silva, Joao Silva)

function normalizeName(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z\s]/g,'').trim();
}

function nameSimilarity(a, b) {
  const na = normalizeName(a).split(' ');
  const nb = normalizeName(b).split(' ');
  // Verifica se primeiro e último nome batem
  const firstMatch = na[0] === nb[0];
  const lastMatch = na[na.length-1] === nb[nb.length-1];
  if(firstMatch && lastMatch) return 1.0;
  if(firstMatch) return 0.7;
  if(lastMatch) return 0.6;
  // Verifica iniciais
  const initA = na.map(n=>n[0]).join('');
  const initB = nb.map(n=>n[0]).join('');
  if(initA===initB) return 0.8;
  return 0;
}

export async function findOrCreateAthlete(data) {
  const { name, age, gender, city, state, birthYear } = data;
  
  // Busca candidatos: mesmo gênero, cidade similar
  const candidates = await prisma.athlete.findMany({
    where: {
      gender: gender || 'M',
      OR: [
        { city: { equals: city, mode: 'insensitive' } },
        { state: state ? { equals: state, mode: 'insensitive' } : undefined }
      ]
    }
  });

  let bestMatch = null;
  let bestScore = 0;

  for(const c of candidates) {
    let score = 0;
    
    // Nome similar (peso 40%)
    const nameScore = nameSimilarity(name, c.name);
    score += nameScore * 40;
    
    // Cidade igual (peso 30%)
    if(city && c.city && normalizeName(city) === normalizeName(c.city)) score += 30;
    
    // Idade próxima (peso 30%) - diferença máx 1 ano (erro de cadastro)
    if(age && c.age) {
      const diff = Math.abs(age - c.age);
      if(diff === 0) score += 30;
      else if(diff === 1) score += 20;
      else if(diff === 2) score += 10;
    }
    
    if(score > bestScore) { bestScore = score; bestMatch = c; }
  }

  // Score >= 70 = mesmo atleta
  if(bestMatch && bestScore >= 70) {
    // Atualiza dados se necessário
    if(bestMatch.name.length < name.length) {
      await prisma.athlete.update({
        where:{id:bestMatch.id},
        data:{name, city:city||bestMatch.city, state:state||bestMatch.state}
      });
    }
    return { athlete: bestMatch, isNew: false, score: bestScore };
  }

  // Cria novo atleta
  const newAthlete = await prisma.athlete.create({
    data: {
      name, age:age||0, gender:gender||'M',
      city:city||'', state:state||''
    }
  });
  return { athlete: newAthlete, isNew: true, score: 0 };
}

export async function mergeDuplicates() {
  const athletes = await prisma.athlete.findMany();
  let mergeCount = 0;
  const toDelete = new Set();

  for(let i=0; i<athletes.length; i++) {
    if(toDelete.has(athletes[i].id)) continue;
    for(let j=i+1; j<athletes.length; j++) {
      if(toDelete.has(athletes[j].id)) continue;
      const a = athletes[i], b = athletes[j];
      if(a.gender !== b.gender) continue;
      
      let score = 0;
      const nameScore = nameSimilarity(a.name, b.name);
      score += nameScore * 40;
      if(a.city && b.city && normalizeName(a.city)===normalizeName(b.city)) score += 30;
      if(a.age && b.age && Math.abs(a.age-b.age)<=1) score += 30;

      if(score >= 80) {
        // Mantém o que tem mais resultados
        const countA = await prisma.result.count({where:{athleteId:a.id}});
        const countB = await prisma.result.count({where:{athleteId:b.id}});
        const keep = countA >= countB ? a : b;
        const remove = countA >= countB ? b : a;
        
        // Reatribui resultados
        await prisma.result.updateMany({where:{athleteId:remove.id},data:{athleteId:keep.id}});
        toDelete.add(remove.id);
        mergeCount++;
      }
    }
  }

  // Deleta duplicatas
  for(const id of toDelete) {
    await prisma.athlete.delete({where:{id}}).catch(()=>{});
  }

  return { merged: mergeCount, deleted: toDelete.size };
}
