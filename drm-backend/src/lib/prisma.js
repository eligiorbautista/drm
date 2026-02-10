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

// Export a proxy that handles connection
module.exports = new Proxy({}, {
  get(target, prop) {
    const client = getPrismaClient();
    if (typeof client[prop] === 'function') {
      return client[prop].bind(client);
    }
    return client[prop];
  }
});
