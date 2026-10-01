/**
 * Tripwire spec for migration 1788000000030-AddMatchSettledAt.
 *
 * Pure unit — no DB connection. Source-greps the migration and the two
 * call sites to enforce:
 *
 *   1. `settled_at` exists on `match` and `down()` drops it
 *   2. the partial index matches the predicate the settlement sweep uses
 *      (`status = 'completed' AND settled_at IS NULL`) — a plain index
 *      would not shrink as the sweep fills rows in, and a mismatched
 *      predicate would make it dead weight
 *   3. `MatchCompletionService` writes the receipt and
 *      `MatchSchedulerService` reads it. Half a contract is worse than
 *      none: a column nothing writes means the sweep re-enqueues every
 *      match forever, and a column nothing reads means settlement is
 *      still only guarded by a 24h Redis key.
 *   4. the entity declares the column, so `migration:generate` doesn't
 *      propose dropping it
 *
 * The failure mode this whole change exists to prevent: `status =
 * COMPLETED` doubling as "settlement ran". There is no way to assert
 * that from a unit test — only that both halves of the receipt agree
 * with each other, which is what (3) and (4) pin.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = readFileSync(
  join(__dirname, '1788000000030-AddMatchSettledAt.ts'),
  'utf8',
);
const REPO = join(__dirname, '..', '..', '..', '..');

const SERVICE = readFileSync(
  join(REPO, 'api', 'src', 'api', 'match', 'match-completion.service.ts'),
  'utf8',
);
const SCHEDULER = readFileSync(
  join(REPO, 'settlement', 'src', 'scheduler', 'match-scheduler.service.ts'),
  'utf8',
);
const ENTITY = readFileSync(
  join(REPO, 'libs', 'database', 'src', 'entities', 'match.entity.ts'),
  'utf8',
);

/** Body of `public async up(...)`. */
function upBody(): string {
  return MIGRATION.slice(
    MIGRATION.indexOf('public async up'),
    MIGRATION.indexOf('public async down'),
  );
}

/** Body of `public async down(...)`. */
function downBody(): string {
  return MIGRATION.slice(MIGRATION.indexOf('public async down'));
}

describe('migration 1788000000030-AddMatchSettledAt', () => {
  it('follows the project naming convention', () => {
    expect(MIGRATION).toMatch(/export class AddMatchSettledAt1788000000030/);
    expect(MIGRATION).toMatch(/name = 'AddMatchSettledAt1788000000030'/);
  });

  it('adds settled_at to match and down() removes it', () => {
    expect(upBody()).toContain('ADD COLUMN IF NOT EXISTS "settled_at"');
    expect(downBody()).toContain('DROP COLUMN IF EXISTS "settled_at"');
  });

  it('is idempotent in both directions', () => {
    expect(upBody()).toMatch(/ADD COLUMN IF NOT EXISTS/);
    expect(downBody()).toMatch(/DROP COLUMN IF EXISTS/);
    expect(upBody()).toMatch(/CREATE INDEX IF NOT EXISTS/);
    expect(downBody()).toMatch(/DROP INDEX IF EXISTS/);
  });

  it('REGRESSION: the partial index predicate matches the sweep query', () => {
    // The sweep selects `status = 'completed' AND settled_at IS NULL`.
    // A partial index on a different predicate would never be used, and
    // a non-partial index would keep every settled row forever instead
    // of shrinking as the sweep fills them in.
    const m = upBody().match(
      /CREATE INDEX IF NOT EXISTS "IDX_match_unsettled"[\s\S]*?WHERE (.+)$/m,
    );
    expect(m).not.toBeNull();
    const predicate = m![1].replace(/\s+/g, ' ');
    expect(predicate).toContain('"settled_at" IS NULL');
    expect(predicate).toContain(`"status" = 'completed'`);
  });

  it('backfills only rows that finished more than a day ago', () => {
    // Backfilling everything would mean never re-settling a genuinely
    // missed match; backfilling nothing would mean re-settling all of
    // history once. The 1-day cutoff threads that needle.
    const m = upBody().match(/UPDATE "match"[\s\S]*?;/);
    expect(m).not.toBeNull();
    expect(m![0]).toContain(`"settled_at" IS NULL`);
    expect(m![0]).toContain(`"status" = 'completed'`);
    expect(m![0]).toContain(`"completed_at" IS NOT NULL`);
    expect(m![0]).toMatch(/INTERVAL '1 day'/);
  });

  describe('both halves of the contract exist', () => {
    it('MatchCompletionService WRITES the receipt', () => {
      expect(SERVICE).toMatch(/settledAt:\s*new Date\(\)/);
    });

    it('MatchCompletionService READS the receipt to dedup', () => {
      // Without this the column is write-only and the 24h Redis key is
      // still the only guard, so a late duplicate re-applies standings,
      // ELO, minutes, fan and revenue.
      expect(SERVICE).toMatch(/if \(match\.settledAt\)/);
    });

    it('the receipt is written AFTER the mutation steps, not before', () => {
      // If it were stamped first, a mid-way failure would mark a
      // partially-settled match as done and strand it permanently.
      const stampAt = SERVICE.indexOf('settledAt: new Date()');
      expect(stampAt).toBeGreaterThan(-1);
      for (const step of [
        'this.updateLeagueStandings(match)',
        'this.addMatchMinutes(match)',
        'this.updateEloRatings(match)',
        'this.updateFanAndRevenue(match)',
      ]) {
        expect(SERVICE.indexOf(step)).toBeLessThan(stampAt);
      }
    });

    it('MatchSchedulerService SWEEPS on it', () => {
      expect(SCHEDULER).toContain('reconcileUnsettledMatches');
      expect(SCHEDULER).toMatch(/settledAt: IsNull\(\)/);
      expect(SCHEDULER).toMatch(/status: MatchStatus\.COMPLETED/);
    });

    it('the sweep is not short-circuited by an empty main scan', () => {
      // `if (matches.length === 0) return;` before the sweep call would
      // mean recovery only ever runs on ticks that also finalised a
      // match — i.e. the tick most likely to have nothing to do.
      const earlyReturn = SCHEDULER.slice(
        SCHEDULER.indexOf('async completeMatches()'),
        SCHEDULER.indexOf('await this.reconcileUnsettledMatches(now)'),
      );
      expect(earlyReturn).not.toMatch(
        /if \(matches\.length === 0\)\s*\{\s*return;/,
      );
    });

    it('the entity declares the column (no migration:generate drift)', () => {
      expect(ENTITY).toContain(
        `@Column({ name: 'settled_at', type: 'timestamptz', nullable: true })`,
      );
      expect(ENTITY).toMatch(/settledAt\?: Date \| null/);
    });
  });
});
