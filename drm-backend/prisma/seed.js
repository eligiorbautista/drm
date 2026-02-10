const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

// ============================================================================
// Seed Users
// ============================================================================
async function seedUsers() {
  console.log('\n[INFO] Seeding user accounts...');

  const saltRounds = 12;

  const users = [
    {
      email: 'admin@sb2024.live',
      username: 'admin',
      password: 'pwq123456',
      role: 'admin',
    },
    {
      email: 'user1@sb2024.live',
      username: 'user1',
      password: 'pwq123456',
      role: 'user',
    },
    {
      email: 'user2@sb2024.live',
      username: 'user2',
      password: 'pwq123456',
      role: 'user',
    },
    {
      email: 'user3@sb2024.live',
      username: 'user3',
      password: 'pwq123456',
      role: 'user',
    },
    {
      email: 'user4@sb2024.live',
      username: 'user4',
      password: 'pwq123456',
      role: 'user',
    },
    {
      email: 'user5@sb2024.live',
      username: 'user5',
      password: 'pwq123456',
      role: 'user',
    },
    {
      email: 'user6@sb2024.live',
      username: 'user6',
      password: 'pwq123456',
      role: 'user',
    },
  ];

  for (const userData of users) {
    try {
      const existingUser = await prisma.user.findUnique({
        where: { email: userData.email },
      });

      if (existingUser) {
        console.log(`[INFO] User ${userData.email} already exists, skipping...`);
        continue;
      }

      const passwordHash = await bcrypt.hash(userData.password, saltRounds);

      await prisma.user.create({
        data: {
          email: userData.email,
          username: userData.username,
          passwordHash,
          role: userData.role,
        },
      });

      console.log(`[INFO] Created user: ${userData.email} (username: ${userData.username})`);
    } catch (error) {
      console.error(`[ERROR] Failed to create user ${userData.email}:`, error.message);
    }
  }

  const userCount = await prisma.user.count();
  console.log(`[INFO] Total users: ${userCount}`);
}

async function main() {
  console.log('[INFO] Starting database seed...');

  // ============================================================================
  // Delete all existing data (respecting foreign key constraints)
  // ============================================================================
  console.log('\n[INFO] Deleting all existing data...');

  await prisma.userSession.deleteMany({});
  console.log('[INFO] User sessions deleted');

  await prisma.broadcastSession.deleteMany({});
  console.log('[INFO] Broadcast sessions deleted');

  await prisma.licenseRequest.deleteMany({});
  console.log('[INFO] License requests deleted');

  await prisma.setting.deleteMany({});
  console.log('[INFO] Settings deleted');

  await prisma.user.deleteMany({});
  console.log('[INFO] Users deleted');

  // ============================================================================
  // Seed Users
  // ============================================================================
  await seedUsers();

  // ============================================================================
  // Initialize default settings
  // ============================================================================
  console.log('\n[INFO] Initializing default settings...');

  const { initializeDefaultSettings } = require('../src/services/settingsService');
  const settingsResult = await initializeDefaultSettings();

  console.log(
    `[INFO] Default settings initialized: ${settingsResult.initialized} new, ${settingsResult.updated} updated`
  );


  // ============================================================================
  // Summary
  // ============================================================================
  console.log('\n[INFO] Database seeding completed successfully!\n');

  const userCount = await prisma.user.count();
  const settingsCount = await prisma.setting.count();

  console.log('[INFO] Statistics:');
  console.log(`   Users: ${userCount}`);
  console.log(`   Settings: ${settingsCount}`);
  console.log();
}

main()
  .catch((e) => {
    console.error('[ERROR] Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
