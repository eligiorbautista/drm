/**
 * Fix production database: Add username column to users table
 *
 * Usage: node fix-production-db.js
 * Or: DATABASE_URL="your_production_url" node fix-production-db.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixDatabase() {
  console.log('Starting database fix...\n');

  try {
    // Check if username column exists
    const columns = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name = 'username'
    `;

    if (columns.length > 0) {
      console.log('✓ Username column already exists');

      // Check if it has data
      const users = await prisma.user.findMany({ take: 5 });
      console.log(`\nSample users:`);
      users.forEach(u => {
        console.log(`  - ${u.email}: username = ${u.username || 'NULL'}`);
      });

      return;
    }

    console.log('✗ Username column missing. Adding it now...');

    // Add the column
    await prisma.$executeRaw`
      ALTER TABLE "users" ADD COLUMN "username" TEXT
    `;
    console.log('  ✓ Added username column');

    // Fill it with data based on email
    const result = await prisma.$executeRaw`
      UPDATE "users"
      SET "username" = LOWER(SUBSTRING("email", 1, STRPOS("email", '@') - 1))
      WHERE "username" IS NULL OR "username" = ''
    `;
    console.log(`  ✓ Updated ${result} users with username data`);

    // Make it NOT NULL
    await prisma.$executeRaw`
      ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL
    `;
    console.log('  ✓ Made username NOT NULL');

    // Add unique constraint
    await prisma.$executeRaw`
      ALTER TABLE "users" ADD CONSTRAINT "users_username_key" UNIQUE ("username")
    `;
    console.log('  ✓ Added unique constraint on username');

    // Add index
    await prisma.$executeRaw`
      CREATE INDEX "users_username_idx" ON "users"("username")
    `;
    console.log('  ✓ Created index on username');

    console.log('\n✓ Database fix completed successfully!');

  } catch (error) {
    console.error('\n✗ Error fixing database:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the fix
fixDatabase()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nFailed:', error);
    process.exit(1);
  });
