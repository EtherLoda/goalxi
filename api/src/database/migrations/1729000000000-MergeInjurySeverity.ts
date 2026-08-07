import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Collapse the 3-tier injury severity (1=mild, 2=moderate, 3=severe)
 * into a 2-tier model (1=mild, 2=severe). `moderate` is folded into
 * `severe` because both forced the player off the pitch — only the
 * recovery length differed, and that is driven by `injury_value` now
 * (see `injury.system.ts` INJURY_VALUES post-2026-08-06).
 *
 * The remap is a single `UPDATE` because:
 *   - `severity = 1` is already `mild` and needs no change.
 *   - `severity = 2` was `moderate`, which lines up with the new
 *     "severe" semantic, so leaving it alone keeps the data correct
 *     under the new terminology.
 *   - `severity = 3` was the old "severe" (e.g. ACL tear, 100-190
 *     injury value range). Mapping it to 2 folds it into the same
 *     bucket the new "severe" lives in.
 *
 * The migration is idempotent: re-running it is a no-op (no rows
 * match `severity = 3` after the first run). We also clamp any stray
 * `severity > 2` row defensively in case future writes drift.
 */
export class MergeInjurySeverity1729000000000 implements MigrationInterface {
  name = 'MergeInjurySeverity1729000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "injury" SET "severity" = 2 WHERE "severity" = 3
    `);
    // Defensive: any out-of-range row from a future regression also
    // clamps to 2 (severe). 1 and 2 are untouched.
    await queryRunner.query(`
      UPDATE "injury" SET "severity" = 2 WHERE "severity" < 1 OR "severity" > 2
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The down() is lossy on purpose — the reverse split (which 2s
    // were originally "moderate" vs originally "severe") is not
    // derivable from the collapsed data. A real rollback needs a
    // backup, not a SQL statement.
    throw new Error(
      'MergeInjurySeverity1729000000000 cannot be reversed: ' +
        'the original 2/3 distinction is not recoverable from the ' +
        'collapsed rows. Restore from backup if you need to roll back.',
    );
  }
}
