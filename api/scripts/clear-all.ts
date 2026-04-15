import 'reflect-metadata';
import { AppDataSource } from '../src/database/data-source';

async function clearAllData() {
  try {
    console.log('🚀 Connecting to database...');
    await AppDataSource.initialize();
    console.log('✅ Connected\n');

    // Use DROP TABLE IF EXISTS ... CASCADE to handle dependent objects
    console.log('🗑️  Dropping match events...');
    await AppDataSource.query('DROP TABLE IF EXISTS match_event CASCADE');

    console.log('🗑️  Dropping match tactics...');
    await AppDataSource.query('DROP TABLE IF EXISTS match_tactics CASCADE');

    console.log('🗑️  Dropping match team stats...');
    await AppDataSource.query('DROP TABLE IF EXISTS match_team_stats CASCADE');

    console.log('🗑️  Dropping matches...');
    await AppDataSource.query('DROP TABLE IF EXISTS match CASCADE');

    console.log('🗑️  Dropping youth match events...');
    await AppDataSource.query('DROP TABLE IF EXISTS youth_match_event CASCADE');

    console.log('🗑️  Dropping youth match tactics...');
    await AppDataSource.query(
      'DROP TABLE IF EXISTS youth_match_tactics CASCADE',
    );

    console.log('🗑️  Dropping youth matches...');
    await AppDataSource.query('DROP TABLE IF EXISTS youth_match CASCADE');

    console.log('🗑️  Dropping tactics presets...');
    await AppDataSource.query('DROP TABLE IF EXISTS tactics_preset CASCADE');

    console.log('🗑️  Dropping staff...');
    await AppDataSource.query('DROP TABLE IF EXISTS staff CASCADE');

    console.log('🗑️  Dropping season results...');
    await AppDataSource.query('DROP TABLE IF EXISTS season_result CASCADE');

    console.log('🗑️  Dropping transactions...');
    await AppDataSource.query('DROP TABLE IF EXISTS transaction CASCADE');

    console.log('🗑️  Dropping transfer transactions...');
    await AppDataSource.query(
      'DROP TABLE IF EXISTS transfer_transaction CASCADE',
    );

    console.log('🗑️  Dropping injuries...');
    await AppDataSource.query('DROP TABLE IF EXISTS injury CASCADE');

    console.log('🗑️  Dropping auctions...');
    await AppDataSource.query('DROP TABLE IF EXISTS auction CASCADE');

    console.log('🗑️  Dropping players...');
    await AppDataSource.query('DROP TABLE IF EXISTS player CASCADE');

    console.log('🗑️  Dropping youth players...');
    await AppDataSource.query('DROP TABLE IF EXISTS youth_player CASCADE');

    console.log('🗑️  Dropping league standings...');
    await AppDataSource.query('DROP TABLE IF EXISTS league_standing CASCADE');

    console.log('🗑️  Dropping finance...');
    await AppDataSource.query('DROP TABLE IF EXISTS finance CASCADE');

    console.log('🗑️  Dropping fans...');
    await AppDataSource.query('DROP TABLE IF EXISTS fan CASCADE');

    console.log('🗑️  Dropping stadiums...');
    await AppDataSource.query('DROP TABLE IF EXISTS stadium CASCADE');

    console.log('🗑️  Dropping youth teams...');
    await AppDataSource.query('DROP TABLE IF EXISTS youth_team CASCADE');

    console.log('🗑️  Dropping sessions...');
    await AppDataSource.query('DROP TABLE IF EXISTS session CASCADE');

    console.log('🗑️  Dropping teams...');
    await AppDataSource.query('DROP TABLE IF EXISTS team CASCADE');

    console.log('🗑️  Dropping leagues...');
    await AppDataSource.query('DROP TABLE IF EXISTS league CASCADE');

    console.log('🗑️  Dropping users...');
    await AppDataSource.query('DROP TABLE IF EXISTS "user" CASCADE');

    console.log('🗑️  Clearing migration records...');
    await AppDataSource.query('DELETE FROM migrations');

    console.log('✅ All seed data cleared!\n');
    await AppDataSource.destroy();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

clearAllData();
