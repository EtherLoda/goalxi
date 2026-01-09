import 'reflect-metadata';
import { AppDataSource } from '../src/database/data-source';

async function clearAllData() {
    try {
        console.log('🚀 Connecting to database...');
        await AppDataSource.initialize();
        console.log('✅ Connected\n');

        // Delete in correct order (respecting foreign keys)
        console.log('🗑️  Deleting match events...');
        await AppDataSource.query('DELETE FROM match_event');

        console.log('🗑️  Deleting match team stats...');
        await AppDataSource.query('DELETE FROM match_team_stats');

        console.log('🗑️  Deleting match tactics...');
        await AppDataSource.query('DELETE FROM match_tactics');

        console.log('🗑️  Deleting matches...');
        await AppDataSource.query('DELETE FROM match');

        console.log('🗑️  Deleting league standings...');
        await AppDataSource.query('DELETE FROM league_standing');

        console.log('🗑️  Deleting player transactions...');
        await AppDataSource.query('DELETE FROM player_transaction');

        console.log('🗑️  Deleting auctions...');
        await AppDataSource.query('DELETE FROM auction');

        console.log('🗑️  Deleting player history...');
        await AppDataSource.query('DELETE FROM player_history');

        console.log('🗑️  Deleting players...');
        await AppDataSource.query('DELETE FROM player');

        console.log('🗑️  Deleting sessions...');
        await AppDataSource.query('DELETE FROM session');

        console.log('🗑️  Deleting transactions...');
        await AppDataSource.query('DELETE FROM transaction');

        console.log('🗑️  Deleting finance...');
        await AppDataSource.query('DELETE FROM finance');

        console.log('🗑️  Deleting team season results...');
        await AppDataSource.query('DELETE FROM season_result');

        console.log('🗑️  Deleting teams...');
        await AppDataSource.query('DELETE FROM team');

        console.log('🗑️  Deleting users...');
        await AppDataSource.query('DELETE FROM "user"');

        console.log('🗑️  Deleting leagues...');
        await AppDataSource.query('DELETE FROM league');

        console.log('✅ All data cleared!\n');
        await AppDataSource.destroy();
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

clearAllData();
