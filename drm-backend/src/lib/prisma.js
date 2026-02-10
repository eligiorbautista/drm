const { PrismaClient } = require('@prisma/client');

/**
 * Prisma Client Singleton
 *
 * In development, we want to reuse the same instance to avoid
 * "too many connections" errors when the hot reload happens.
 */
const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
});

if (process.env.NODE_ENV === 'development') {
  global.prisma = prisma;
}

/**
 * Graceful shutdown handler
 */
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = prisma;
