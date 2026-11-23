import { PrismaClient } from '@prisma/client';

/**
 * Tek Prisma örneği. `$transaction` ile atomik kurulum ve kontenjan kilidi
 * bu istemci üzerinden yürütülür.
 */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
