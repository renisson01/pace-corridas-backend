import { prisma } from '../../utils/prisma.js';

export const matchService = {
  async findMatches() {
    return { message: 'Match em desenvolvimento' };
  }
};
