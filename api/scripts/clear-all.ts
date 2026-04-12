import 'reflect-metadata';
import { AppDataSource } from '../src/database/data-source';

async function clearAllData() {
  try {
    console.log('🚀 Connecting to database...');
    await AppDataSource.initialize();
    console.log('✅ Connected\n');

    // Delete in correct order (respecting foreign keys)
    console.log('🗑️  Deleting auctions...');
    await AppDataSource.query('DELETE FROM auction');

    console.log('🗑️  Deleting players...');
    await AppDataSource.query('DELETE FROM player');

    console.log('🗑️  Deleting league standings...');
    await AppDataSource.query('DELETE FROM league_standing');

    console.log('🗑️  Deleting finance...');
    await AppDataSource.query('DELETE FROM finance');

    console.log('🗑️  Deleting fans...');
    await AppDataSource.query('DELETE FROM fan');

    console.log('🗑️  Deleting stadiums...');
    await AppDataSource.query('DELETE FROM stadium');

    console.log('🗑️  Deleting sessions...');
    await AppDataSource.query('DELETE FROM session');

    console.log('🗑️  Deleting teams...');
    await AppDataSource.query('DELETE FROM team');

    console.log('🗑️  Deleting leagues...');
    await AppDataSource.query('DELETE FROM league');

    console.log('🗑️  Deleting users...');
    await AppDataSource.query('DELETE FROM "user"');

    console.log('✅ All seed data cleared!\n');
    await AppDataSource.destroy();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

clearAllData();
