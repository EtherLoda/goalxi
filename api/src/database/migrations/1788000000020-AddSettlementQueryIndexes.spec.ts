/**
 * Tripwire spec for migration 1788000000020-AddSettlementQueryIndexes.
 *
 * Pure unit — no DB connection. Source-greps the migration file to
 * enforce:
 *   1. every index it creates has a matching DROP in `down()`
 *   2. every statement is `IF NOT EXISTS` / `IF EXISTS`, so a re-run on
 *      a database where an operator already added an index by hand is a
 *      no-op rather than a failure mid-migration
 *   3. the three columns the settlement passes filter on are actually
 *      the leading columns of a new index — `transaction.season`,
 *      `team.league_id`, and `match.(league_id, season, status)`. Each
 *      was a full sequential scan before.
 *
 * A migration that creates an index and forgets to drop it in `down()`
 * leaves a permanently-orphaned index after any rollback, which is the
 * kind of thing nobody notices until the next `migration:down` in prod.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(__dirname, '1788000000020-AddSettlementQueryIndexes.ts'),
  'utf8',
);

/** Body of `public async up(...)`. */
function upBody(): string {
  const start = SRC.indexOf('public async up');
  const end = SRC.indexOf('public async down');
  return SRC.slice(start, end);
}

/** Body of `public async down(...)`. */
function downBody(): string {
  const start = SRC.indexOf('public async down');
  return SRC.slice(start);
}

describe('migration 1788000000020-AddSettlementQueryIndexes', () => {
  it('follows the project naming convention (class + name match the filename)', () => {
    expect(SRC).toMatch(/export class AddSettlementQueryIndexes1788000000020/);
    expect(SRC).toMatch(/name = 'AddSettlementQueryIndexes1788000000020'/);
  });

  it('creates the four indexes in up()', () => {
    const up = upBody();
    for (const index of [
      'IDX_transaction_season_team',
      'IDX_team_league_id',
      'IDX_match_league_season_status_completed',
      'IDX_match_season_week_type_status',
    ]) {
      expect(up).toContain(`CREATE INDEX IF NOT EXISTS "${index}"`);
    }
  });

  it('drops every index it creates', () => {
    const down = downBody();
    const created = [
      ...upBody().matchAll(/CREATE INDEX IF NOT EXISTS "([^"]+)"/g),
    ].map((m) => m[1]);

    expect(created.length).toBeGreaterThan(0);
    for (const index of created) {
      expect({ index, dropped: down.includes(`"${index}"`) }).toEqual({
        index,
        dropped: true,
      });
    }
  });

  it('is idempotent in both directions', () => {
    // A partially-applied migration (crash between statements, or an
    // operator who added the index by hand) must not fail on re-run.
    expect(upBody()).not.toMatch(/CREATE INDEX (?!IF NOT EXISTS)/);
    expect(downBody()).not.toMatch(/DROP INDEX (?!IF EXISTS)/);
  });

  it('REGRESSION: transaction.season is the LEADING column, not a trailing one', () => {
    // `SeasonArchiveService.archiveTransactions` does
    // `find({ where: { season } })` at season end over 200k-400k rows.
    // An index where `season` is not first cannot serve that scan.
    const m = upBody().match(
      /CREATE INDEX IF NOT EXISTS "IDX_transaction_season_team"\s*ON "transaction" \(([^)]+)\)/,
    );
    expect(m).not.toBeNull();
    expect(m![1].split(',')[0].trim()).toBe('"season"');
  });

  it('REGRESSION: team.league_id gets an index (FK-less uuid, so none existed)', () => {
    // `league_id` on `team` is a plain uuid with no foreign key, so
    // PostgreSQL never created an implicit index. `initNewSeasonStandings`
    // did `find({ where: { leagueId } })` once per league = 85 sequential
    // scans of the team table per season transition.
    const m = upBody().match(
      /CREATE INDEX IF NOT EXISTS "IDX_team_league_id"\s*ON "team" \(([^)]+)\)/,
    );
    expect(m).not.toBeNull();
    expect(m![1].trim()).toBe('"league_id"');
  });

  it('REGRESSION: the match index covers the standings read shape', () => {
    // `LeagueService.getStandings` (a @Public() endpoint) loads
    // `where: { leagueId, season, status: 'completed' }` ordered by
    // `completedAt DESC`. Three equality predicates then an ordered scan
    // means Postgres needs no sort node.
    const m = upBody().match(
      /CREATE INDEX IF NOT EXISTS "IDX_match_league_season_status_completed"\s*ON "match" \(([^)]+)\)/,
    );
    expect(m).not.toBeNull();
    const cols = m![1].split(',').map((c) => c.trim().replace(/"/g, ''));
    expect(cols.slice(0, 3)).toEqual(['league_id', 'season', 'status']);
    expect(cols[3]).toBe('completed_at DESC');
  });

  it('does not touch columns — this migration is indexes only', () => {
    // An index-only migration must stay index-only: a stray ALTER in
    // here would make `down()` incomplete (see the drop test above).
    expect(upBody()).not.toMatch(/ALTER TABLE/i);
    expect(upBody()).not.toMatch(/\bDROP\b/i);
  });
});
