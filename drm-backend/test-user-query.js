const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    console.log('Testing user query with username column...\n');

    const user = await prisma.user.findFirst();
    if (user) {
      console.log('User found!');
      console.log('- ID:', user.id);
      console.log('- Email:', user.email);
      console.log('- Username:', user.username || 'NO USERNAME');
      console.log('- Role:', user.role);
      console.log('- Active:', user.isActive);
    } else {
      console.log('No users found in database.');
    }
  } catch (error) {
    console.error('Error querying user:', error.message);
    console.error('Full error:', error);
  } finally {
    await prisma.$disconnect();
  }
})();
