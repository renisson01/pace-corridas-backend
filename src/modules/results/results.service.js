import prisma from '../../lib/prisma.js';
import { calculatePace, getAgeGroup } from '../../utils/helpers.js';

const PONTOS_GERAL = { 1: 20, 2: 16, 3: 14, 4: 12, 5: 10 };
const PONTOS_FAIXA = { 1: 6, 2: 4, 3: 2 };
const PONTOS_CONCLUSAO = 1;

export const resultsService = {
  async create(data) {
    const { raceId, athleteName, age, gender, distance, time, city, state } = data;
    let athlete = await prisma.athlete.findFirst({
      where: { name: athleteName, age }
    });
    if (!athlete) {
      athlete = await prisma.athlete.create({
        data: { name: athleteName, age, gender, city, state }
      });
    }
    const distanceKm = parseFloat(distance.replace('k','').replace('km',''));
    const pace = calculatePace(time, distanceKm);
    const ageGroup = (age != null && gender) ? getAgeGroup(age, gender) : null;
    return await prisma.result.create({
      data: {
        raceId, athleteId: athlete.id, distance, time, pace, ageGroup,
        overallRank: 0, genderRank: 0, points: PONTOS_CONCLUSAO
      }
    });
  },

  async findByRace(raceId, distance) {
    const where = { raceId };
    if (distance) where.distance = distance;
    return await prisma.result.findMany({
      where, include: { athlete: true }, orderBy: { time: 'asc' }
    });
  },

  async calculateRankings(raceId, distance) {
    const results = await this.findByRace(raceId, distance);
    const atletasComPontosGeral = new Set();

    // Ranking geral (todos)
    results.forEach((r, i) => { r.overallRank = i + 1; });

    // Ranking por genero
    const byGender = {};
    results.forEach(r => {
      const g = r.athlete.gender || 'X';
      if (!byGender[g]) byGender[g] = [];
      byGender[g].push(r);
    });
    Object.values(byGender).forEach(list => {
      list.forEach((r, i) => {
        r.genderRank = i + 1;
        // Pontos geral: top 5 por genero
        const pts = PONTOS_GERAL[i + 1];
        if (pts) {
          r.points = pts + PONTOS_CONCLUSAO;
          atletasComPontosGeral.add(r.athleteId);
        } else {
          r.points = PONTOS_CONCLUSAO;
        }
      });
    });

    // Ranking por faixa etaria (quem JA ganhou geral NAO entra)
    const byAge = {};
    results.forEach(r => {
      const group = r.ageGroup || 'GERAL';
      if (!byAge[group]) byAge[group] = [];
      byAge[group].push(r);
    });
    Object.values(byAge).forEach(list => {
      let faixaPos = 0;
      list.forEach(r => {
        if (!atletasComPontosGeral.has(r.athleteId)) {
          faixaPos++;
          const ptsFaixa = PONTOS_FAIXA[faixaPos];
          if (ptsFaixa) {
            r.points = ptsFaixa + PONTOS_CONCLUSAO;
          }
        }
      });
    });

    // Salvar no banco e atualizar totalPoints do atleta
    for (const r of results) {
      await prisma.result.update({
        where: { id: r.id },
        data: { overallRank: r.overallRank, genderRank: r.genderRank, points: r.points }
      });
    }

    // Recalcular totalPoints e totalRaces de cada atleta
    const athleteIds = [...new Set(results.map(r => r.athleteId))];
    for (const aid of athleteIds) {
      const allResults = await prisma.result.findMany({ where: { athleteId: aid } });
      const totalPoints = allResults.reduce((sum, r) => sum + (r.points || 0), 0);
      await prisma.athlete.update({
        where: { id: aid },
        data: { totalPoints, totalRaces: allResults.length }
      });
    }

    return results;
  }
};
