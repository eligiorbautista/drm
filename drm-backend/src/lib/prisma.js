const { PrismaClient } = require('@prisma/client');

/**
 * Prisma Client Singleton
 *
 * Handles serverless cold starts and development hot reloads
 */
let prisma;

function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    });
  }
  return prisma;
}

// Export the Prisma client directly
module.exports = getPrismaClient();
