import { prisma } from '../../utils/prisma.js';
import { calculatePace, getAgeGroup } from '../../utils/helpers.js';

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
    
    const distanceKm = parseFloat(distance.replace('k', ''));
    const pace = calculatePace(time, distanceKm);
    const ageGroup = getAgeGroup(age, gender);
    
    return await prisma.result.create({
      data: {
        raceId, athleteId: athlete.id, distance, time, pace, ageGroup,
        overallRank: 0, genderRank: 0, ageGroupRank: 0
      }
    });
  },

  async findByRace(raceId, distance) {
    const where = { raceId };
    if (distance) where.distance = distance;
    return await prisma.result.findMany({
      where,
      include: { athlete: true },
      orderBy: { time: 'asc' }
    });
  },

  async calculateRankings(raceId, distance) {
    const results = await this.findByRace(raceId, distance);
    results.forEach((result, index) => { result.overallRank = index + 1; });
    
    const byGender = {};
    results.forEach(result => {
      const gender = result.athlete.gender;
      if (!byGender[gender]) byGender[gender] = [];
      byGender[gender].push(result);
    });
    Object.values(byGender).forEach(genderResults => {
      genderResults.forEach((result, index) => { result.genderRank = index + 1; });
    });
    
    const byAgeGroup = {};
    results.forEach(result => {
      const group = result.ageGroup;
      if (!byAgeGroup[group]) byAgeGroup[group] = [];
      byAgeGroup[group].push(result);
    });
    Object.values(byAgeGroup).forEach(groupResults => {
      groupResults.forEach((result, index) => { result.ageGroupRank = index + 1; });
    });
    
    for (const result of results) {
      await prisma.result.update({
        where: { id: result.id },
        data: {
          overallRank: result.overallRank,
          genderRank: result.genderRank,
          ageGroupRank: result.ageGroupRank
        }
      });
    }
    return results;
  }
};
