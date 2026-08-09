// One-off: migrate player specialties from the v1 single-ability
// shape (attributes->abilities JSONB array) to the v2 dedicated
// columns (core_specialty + core_specialty_tier).
//
// Mapping (from docs/specialty-v2-design.md §6):
//   HEADER  → AERIAL_THREAT
//   LPASS   → PLAYMAKER
//   CROSS   → CROSSER
//   DRBLE   → DRIBBLER
//   LSHT    → COMPOSED
//   CLUCH   → COMPOSED
//   TACKL   → TACKLER
//   PSAVE   → SAVING_MASTER
//   CNTR    → SPEEDSTER
//   REBND   → POACHER
//   FSTRT   → SPEEDSTER
//
// All migrated players get tier 'BRONZE' (per the doc's "conservative
// backfill" decision). The migration is idempotent — re-running it
// is a no-op because the WHERE clause only matches rows whose
// `abilities` array is non-empty AND whose `core_specialty` is
// still NULL.
//
// Usage:
//   node api/scripts/migrate-specialty-v2.js           # actually run
//   node api/scripts/migrate-specialty-v2.js --dry-run # show what would happen
//
// Reads connection params from api/.env.

const fs = require('fs');
const path = require('path');
const { Client } = require('C:/Code/Project/GoalXI/node_modules/.pnpm/pg@8.16.3/node_modules/pg');

const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('ERR: api/.env not found at', envPath);
  process.exit(1);
}
const envText = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  if (!line || line.trim().startsWith('#')) continue;
  const idx = line.indexOf('=');
  if (idx <= 0) continue;
  const k = line.slice(0, idx).trim();
  let v = line.slice(idx + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  env[k] = v;
}

const cfg = {
  host: env.DATABASE_HOST,
  port: parseInt(env.DATABASE_PORT, 10),
  user: env.DATABASE_USERNAME,
  password: env.DATABASE_PASSWORD,
  database: env.DATABASE_NAME,
};

const dryRun = process.argv.includes('--dry-run');

const V1_TO_V2 = {
  HEADER: 'AERIAL_THREAT',
  LPASS: 'PLAYMAKER',
  CROSS: 'CROSSER',
  DRBLE: 'DRIBBLER',
  LSHT: 'COMPOSED',
  CLUCH: 'COMPOSED',
  TACKL: 'TACKLER',
  PSAVE: 'SAVING_MASTER',
  CNTR: 'SPEEDSTER',
  REBND: 'POACHER',
  FSTRT: 'SPEEDSTER',
};

(async () => {
  const c = new Client(cfg);
  await c.connect();
  console.log('connected to', cfg.host + ':' + cfg.port + '/' + cfg.database);
  console.log('mode:', dryRun ? 'DRY-RUN (no writes)' : 'APPLY');

  // 1. Count rows that need migration
  const before = await c.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE attributes->'abilities' IS NOT NULL
          AND jsonb_array_length(attributes->'abilities') > 0
      )::int AS with_abilities,
      COUNT(*) FILTER (
        WHERE core_specialty IS NOT NULL
      )::int AS already_migrated
    FROM player
  `);
  const stats = before.rows[0];
  console.log('player rows total:                ', stats.total);
  console.log('player rows with v1 abilities:     ', stats.with_abilities);
  console.log('player rows already on v2 column:  ', stats.already_migrated);
  console.log('player rows that would change:     ', stats.with_abilities - stats.already_migrated);

  // 2. Distribution of v1 ability codes (informational)
  const dist = await c.query(`
    SELECT attributes->'abilities'->>0 AS v1_code, COUNT(*)::int AS n
    FROM player
    WHERE attributes->'abilities' IS NOT NULL
      AND jsonb_array_length(attributes->'abilities') > 0
    GROUP BY 1
    ORDER BY n DESC
  `);
  console.log('\nv1 ability distribution:');
  for (const row of dist.rows) {
    const target = V1_TO_V2[row.v1_code] ?? '(unmapped)';
    console.log(`  ${row.v1_code.padEnd(8)} → ${target.padEnd(15)} ${row.n}`);
  }

  // 3. Idempotent UPDATE — only touches rows that still have
  //    a non-null `abilities` array AND a NULL `core_specialty`.
  //    Re-running on a clean DB touches 0 rows.
  const updateSql = `
    UPDATE player SET
      core_specialty = CASE attributes->'abilities'->>0
        WHEN 'HEADER' THEN 'AERIAL_THREAT'
        WHEN 'LPASS'  THEN 'PLAYMAKER'
        WHEN 'CROSS'  THEN 'CROSSER'
        WHEN 'DRBLE'  THEN 'DRIBBLER'
        WHEN 'LSHT'   THEN 'COMPOSED'
        WHEN 'CLUCH'  THEN 'COMPOSED'
        WHEN 'TACKL'  THEN 'TACKLER'
        WHEN 'PSAVE'  THEN 'SAVING_MASTER'
        WHEN 'CNTR'   THEN 'SPEEDSTER'
        WHEN 'REBND'  THEN 'POACHER'
        WHEN 'FSTRT'  THEN 'SPEEDSTER'
        ELSE NULL
      END,
      core_specialty_tier = 'BRONZE'
    WHERE attributes->'abilities' IS NOT NULL
      AND jsonb_array_length(attributes->'abilities') > 0
      AND core_specialty IS NULL
    RETURNING id
  `;

  if (dryRun) {
    // Wrap in a transaction that we ROLLBACK so we can still see
    // the count without committing.
    await c.query('BEGIN');
    const r = await c.query(updateSql);
    console.log('\nDRY-RUN: would update', r.rowCount, 'rows');
    await c.query('ROLLBACK');
  } else {
    const r = await c.query(updateSql);
    console.log('\napplied:', r.rowCount, 'rows');
  }

  // 4. Final stats
  const after = await c.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE core_specialty IS NOT NULL)::int AS with_v2,
      COUNT(*) FILTER (WHERE core_specialty IS NULL)::int AS no_specialty
    FROM player
  `);
  console.log('\nafter:');
  console.log('  total:        ', after.rows[0].total);
  console.log('  with v2 spec: ', after.rows[0].with_v2);
  console.log('  no specialty: ', after.rows[0].no_specialty);

  await c.end();
  console.log('\ndone.');
})().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
