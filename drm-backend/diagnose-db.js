/**
 * Database Diagnostic Script
 *
 * Shows information about the current database connection and schema
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
  console.log('=== Database Diagnostic Tool ===\n');
  console.log('Checking database connection...\n');

  try {
    // Test connection
    await prisma.$connect();
    console.log('✓ Connected to database');

    // Get database info
    const result = await prisma.$queryRaw`
      SELECT current_database() as database,
             current_user as user,
             version() as version
    `;
    console.log('\nDatabase Information:');
    console.log(`  Database: ${result[0].database}`);
    console.log(`  User: ${result[0].user}`);
    console.log(`  Version: ${result[0].version.split(',')[0]}`);

    // Check users table columns
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `;

    console.log('\nUsers Table Columns:');
    columns.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      console.log(`  - ${col.column_name.padEnd(20)} ${col.data_type.padEnd(20)} ${nullable}`);
    });

    // Check for username column
    const hasUsername = columns.some(c => c.column_name === 'username');
    if (hasUsername) {
      console.log('\n✓ Username column exists');

      // Check for existing users
      const userCount = await prisma.user.count();
      console.log(`  Total users: ${userCount}`);

      if (userCount > 0) {
        const sampleUsers = await prisma.user.findMany({
          select: { id: true, email: true, username: true },
          take: 3
        });
        console.log('\n  Sample users:');
        sampleUsers.forEach(u => {
          console.log(`    - ${u.email} → username: ${u.username || 'NULL'}`);
        });
      }

      console.log('\n✓ Database is ready for use!');
      console.log('\nIf you are still seeing the "username does not exist" error:');
      console.log('  1. Make sure your frontend is connecting to http://localhost:8000 (local)');
      console.log('  2. Or update your Render deployment to use this DATABASE_URL:');
      console.log('     postgresql://neondb_owner:npg_KuzV4Z7SXwFP@ep-tiny-term-a1a4oboz-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require');

    } else {
      console.log('\n✗ Username column is MISSING!');
      console.log('\nTo fix this, run:');
      console.log('  node fix-production-db.js');
      console.log('\nOr manually add the column using SQL:');
      console.log('  See docs/render-database-fix.sql');
    }

  } catch (error) {
    console.error('\n✗ Error:', error.message);
    if (error.code === 'P1001') {
      console.error('\n  Cannot connect to the database. Check your DATABASE_URL in .env file.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

diagnose();
