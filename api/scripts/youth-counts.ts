/**
 * Quick baseline count helper — run via:
 *   cd api && npx ts-node scripts/youth-counts.ts
 *   # or: npx ts-node --transpile-only scripts/youth-counts.ts
 *
 * The seed script only seeds senior data, so youth_* tables should be
 * empty. We capture this baseline before P1 migration runs.
 */
import { DataSource } from 'typeorm';
import { join } from 'path';

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST || '127.0.0.1',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres123',
    database: process.env.DATABASE_NAME || 'goalxi',
    entities: [join(__dirname, '..', 'src', '**', '*.entity.ts')],
    synchronize: false,
  });
  await ds.initialize();

  const labels: Array<[string, string]> = [
    ['youth_player', 'youth_player'],
    ['youth_match', 'youth_match'],
    ['youth_match_tactics', 'youth_match_tactics'],
    ['youth_match_event', 'youth_match_event'],
    ['player', 'player'],
    ['match', 'match'],
    ['match_tactics', 'match_tactics'],
    ['match_event', 'match_event'],
    ['scout_candidate', 'scout_candidate'],
    ['youth_league', 'youth_league'],
    ['youth_team', 'youth_team'],
  ];

  console.log(process.argv[2] ?? 'BEFORE');
  for (const [, t] of labels) {
    try {
      const r = await ds.query(`SELECT count(*)::int AS n FROM "${t}"`);
      console.log(`  ${t.padEnd(24)} ${String(r[0].n).padStart(6)}`);
    } catch (e: any) {
      // Table may have been dropped (mid-migration) or not yet created.
      console.log(`  ${t.padEnd(24)} (table missing)`);
    }
  }

  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});