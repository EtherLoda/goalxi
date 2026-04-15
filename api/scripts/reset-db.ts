import 'reflect-metadata';
import { DataSource } from 'typeorm';

const DATABASE_NAME = process.env.DATABASE_NAME || 'goalxi';
const DATABASE_HOST = process.env.DATABASE_HOST || 'localhost';
const DATABASE_PORT = parseInt(process.env.DATABASE_PORT || '5432', 10);
const DATABASE_USERNAME = process.env.DATABASE_USERNAME || 'postgres';
const DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || 'postgres';

async function resetDatabase() {
  // Connect to postgres to drop and create the target database
  const adminDataSource = new DataSource({
    type: 'postgres',
    host: DATABASE_HOST,
    port: DATABASE_PORT,
    username: DATABASE_USERNAME,
    password: DATABASE_PASSWORD,
    database: 'postgres', // Connect to default postgres db
  });

  try {
    console.log('🔌 Connecting to postgres...');
    await adminDataSource.initialize();
    console.log('✅ Connected\n');

    // Terminate existing connections to the database
    console.log(`🔌 Terminating connections to ${DATABASE_NAME}...`);
    await adminDataSource.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = '${DATABASE_NAME}'
        AND pid <> pg_backend_pid()
    `);

    // Drop the database
    console.log(`🗑️  Dropping database ${DATABASE_NAME}...`);
    await adminDataSource.query(`DROP DATABASE IF EXISTS "${DATABASE_NAME}"`);

    // Create the database
    console.log(`🗄️  Creating database ${DATABASE_NAME}...`);
    await adminDataSource.query(`CREATE DATABASE "${DATABASE_NAME}"`);

    console.log(`\n✅ Database ${DATABASE_NAME} reset complete!`);
    console.log('   Run "pnpm migration:up" to create tables.\n');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await adminDataSource.destroy();
  }
}

resetDatabase();
