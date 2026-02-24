import pdf from 'pdf-parse';
import { prisma } from '../../utils/prisma.js';
import { calculatePace, getAgeGroup } from '../../utils/helpers.js';
import fs from 'fs';

export const uploadService = {
  async processPDF(filePath, raceId, distance) {
    console.log('📄 Processando PDF:', filePath);
    
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    const text = data.text;
    
    console.log('📝 Texto extraído:', text.substring(0, 200));
    
    // Parse de resultados
    const results = this.parseResults(text, raceId, distance);
    
    console.log('✅ Encontrados:', results.length, 'atletas');
    
    // Salvar no banco
    let saved = 0;
    for (const result of results) {
      try {
        await this.saveResult(result);
        saved++;
      } catch (error) {
        console.log('⚠️ Erro ao salvar:', result.athleteName, error.message);
      }
    }
    
    return { total: results.length, saved };
  },

  parseResults(text, raceId, distance) {
    const lines = text.split('\n');
    const results = [];
    
    // Padrão comum: NOME IDADE CIDADE TEMPO
    // Exemplo: João Silva 32 Aracaju 00:42:15
    const pattern = /^(\d+)\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]+)\s+(\d{2})\s+([MF])\s+([A-Z\s]+)\s+(\d{2}:\d{2}:\d{2})/i;
    
    for (const line of lines) {
      const match = line.match(pattern);
      if (match) {
        const [, position, name, age, gender, city, time] = match;
        
        results.push({
          raceId,
          athleteName: name.trim(),
          age: parseInt(age),
          gender: gender.toUpperCase(),
          distance,
          time: time.trim(),
          city: city.trim(),
          state: 'SE' // Ajustar conforme necessário
        });
      }
    }
    
    // Se padrão acima não funcionar, tentar padrão alternativo
    if (results.length === 0) {
      const altPattern = /([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{3,})\s+(\d{2})\s+([MF])\s+(\d{2}:\d{2}:\d{2})/gi;
      let match;
      
      while ((match = altPattern.exec(text)) !== null) {
        const [, name, age, gender, time] = match;
        
        results.push({
          raceId,
          athleteName: name.trim(),
          age: parseInt(age),
          gender: gender.toUpperCase(),
          distance,
          time: time.trim(),
          city: 'Aracaju',
          state: 'SE'
        });
      }
    }
    
    return results;
  },

  async saveResult(data) {
    const { raceId, athleteName, age, gender, distance, time, city, state } = data;
    
    // Buscar ou criar atleta
    let athlete = await prisma.athlete.findFirst({
      where: { name: athleteName, age }
    });
    
    if (!athlete) {
      athlete = await prisma.athlete.create({
        data: { name: athleteName, age, gender, city, state }
      });
    }
    
    // Calcular pace e faixa
    const distanceKm = parseFloat(distance.replace('k', ''));
    const pace = calculatePace(time, distanceKm);
    const ageGroup = getAgeGroup(age, gender);
    
    // Criar resultado
    return await prisma.result.create({
      data: {
        raceId,
        athleteId: athlete.id,
        distance,
        time,
        pace,
        ageGroup,
        overallRank: 0,
        genderRank: 0,
        ageGroupRank: 0
      }
    });
  }
};
