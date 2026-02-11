const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const users = await prisma.user.findMany();
    console.log('Users in database:', users.length);
    if (users.length > 0) {
      console.log('First user:', {
        id: users[0].id,
        email: users[0].email,
        username: users[0].username || 'NO USERNAME'
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
})();
