if (process.env.DATABASE_TYPE === undefined) {
  process.env.DATABASE_TYPE = 'postgres';
  process.env.DATABASE_HOST = 'localhost';
  process.env.DATABASE_PORT = '25432';
  process.env.DATABASE_USERNAME = 'postgres';
  process.env.DATABASE_PASSWORD = 'postgres';
  process.env.DATABASE_NAME = 'goalxi';
}

import 'reflect-metadata';
import { AppDataSource } from '../src/database/data-source';

const MATCH_ID = process.env.MATCH_ID ?? 'bd7bbfeb-c0a1-4ebf-aeb0-f06ab36a4d4c';

(async () => {
  await AppDataSource.initialize();

  // 1. Snapshot count
  const cnt: any = await AppDataSource.query(
    `SELECT COUNT(*)::int as cnt FROM match_event
     WHERE match_id = $1 AND type_name = 'snapshot'`,
    [MATCH_ID],
  );
  console.log(`\n=== total snapshot rows: ${cnt[0].cnt} ===\n`);

  // 2. Per-minute distribution
  const perMin: any = await AppDataSource.query(
    `SELECT minute, COUNT(*)::int as cnt FROM match_event
     WHERE match_id = $1 AND type_name = 'snapshot'
     GROUP BY minute ORDER BY minute`,
    [MATCH_ID],
  );
  console.log('=== per-minute snapshot count ===');
  console.table(perMin);

  // 3. Sample of last 3 snapshots with full lc (showing pr/mpr)
  const sample: any = await AppDataSource.query(
    `SELECT minute,
            (data->'h'->'lc'->'left'->>'pr')::float as h_L_pr,
            (data->'h'->'lc'->'left'->>'mpr')::float as h_L_mpr,
            (data->'h'->'lc'->'center'->>'pr')::float as h_C_pr,
            (data->'h'->'lc'->'center'->>'mpr')::float as h_C_mpr,
            (data->'a'->'lc'->'left'->>'pr')::float as a_L_pr,
            (data->'a'->'lc'->'left'->>'mpr')::float as a_L_mpr,
            (data->'a'->'lc'->'center'->>'pr')::float as a_C_pr,
            (data->'a'->'lc'->'center'->>'mpr')::float as a_C_mpr
     FROM match_event
     WHERE match_id = $1 AND type_name = 'snapshot'
     ORDER BY minute DESC LIMIT 3`,
    [MATCH_ID],
  );
  console.log(
    '=== last 3 snapshots — pr (push) and mpr (midfield) per side per lane ===',
  );
  console.table(sample);

  // 4. Compute Possession Share for those 3 snapshots (home / (home + away))
  console.log('\n=== home Possession Share (mpr) — left lane ===');
  for (const r of sample.reverse()) {
    const homeShare = r.h_l_mpr / (r.h_l_mpr + r.a_l_mpr);
    console.log(
      `minute ${r.minute}: home ${(homeShare * 100).toFixed(1)}%, away ${((1 - homeShare) * 100).toFixed(1)}%`,
    );
  }

  // 5. All event types summary
  const types: any = await AppDataSource.query(
    `SELECT type_name, COUNT(*)::int as cnt FROM match_event
     WHERE match_id = $1
     GROUP BY type_name ORDER BY cnt DESC`,
    [MATCH_ID],
  );
  console.log('\n=== event type summary ===');
  console.table(types);

  await AppDataSource.destroy();
})();
