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

        console.log('🗑️  Deleting players...');
        await AppDataSource.query('DELETE FROM player');
        console.log(`✅ Deleted all players\n`);

        await AppDataSource.destroy();
        console.log('✅ All data cleared! You can now run: pnpm seed:run');
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

clearAllData();
