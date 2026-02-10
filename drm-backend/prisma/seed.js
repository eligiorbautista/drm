const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('[INFO] Starting database seed...');

  // ============================================================================
  // Delete all existing data
  // ============================================================================
  console.log('\n[INFO] Deleting all existing data...');

  await prisma.broadcastSession.deleteMany({});
  console.log('[INFO] Broadcast sessions deleted');

  await prisma.licenseRequest.deleteMany({});
  console.log('[INFO] License requests deleted');

  await prisma.setting.deleteMany({});
  console.log('[INFO] Settings deleted');

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

  const settingsCount = await prisma.setting.count();

  console.log('[INFO] Statistics:');
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
