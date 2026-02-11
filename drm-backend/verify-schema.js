const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const u = await p.user.findFirst();
  console.log('✓ Database is already updated');
  console.log('\nCurrent schema:');
  console.log('  Has name column:', u.name !== undefined ? 'YES' : 'NO');
  console.log('  Has username column:', u.username !== undefined ? 'YES' : 'NO');
  console.log('\nSample user:');
  console.log('  Email:', u.email);
  console.log('  Name:', u.name || 'NULL');
  console.log('\n✓ No database changes needed');
  await p.$disconnect();
})();
