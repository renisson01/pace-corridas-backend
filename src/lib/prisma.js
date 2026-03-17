import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

if (!globalForPrisma.__prisma) {
  globalForPrisma.__prisma = new PrismaClient({
    log: ['error'],
  });
}

const prisma = globalForPrisma.__prisma;
export default prisma;
