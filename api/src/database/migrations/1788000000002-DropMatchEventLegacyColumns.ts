import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RFC 0002 — Phase 3 (destructive cleanup).
 *
 * Removes the legacy `type` int column on `match_event`. The
 * `typeName` string column STAYS — it is the wire format the
 * FE relies on for commentary templates, timeline, and the
 * EVENT_COLOR / EVENT_ICON lookup tables (see
 * `web/src/components/match/extract-key-events.ts` and 8+
 * other FE call sites).
 *
 * ## Why typeName is kept
 *
 *   The wire `type` is a lower_snake string like 'goal' /
 *   'yellow_card' / 'turnover' that the engine emits as the
 *   `type` field on the in-memory event. The DB `typeName`
 *   column has been a 1:1 mirror of that string since the
 *   v1 schema. The (eventClassId, outcomeId, outcomeCode)
 *   tuple is the new authoritative source, but the wire
 *   `type` is **context-sensitive** in ways the tuple can't
 *   capture:
 *
 *     - PERIOD(2) + END(27) maps to 'half_time', 'full_time',
 *       AND 'second_half' (depending on what period ended).
 *     - SHOT(3) + MISS(4) maps to 'miss' (off_target) OR
 *       'turnover' (failed attack push) — same tuple, two
 *       different wire types.
 *     - FREE_KICK(5) + DIRECT_GOAL(12) maps to 'goal'
 *       (same wire type as SHOT + GOAL).
 *
 *   Reconstructing the wire type at read time would require
 *   keeping a context-dependent mapping that's strictly
 *   more code than just preserving the column. Phase 4
 *   (out of scope here) can collapse the duplication by
 *   adding per-event context fields (e.g. period_label,
 *   shot_context) if a future need drives it.
 *
 * ## What this drops
 *
 *   - `match_event.type`         (int)  — was the MatchEventType enum value
 *
 *   It does NOT drop `typeName` (the wire string) — see above.
 *
 * ## What this does NOT drop
 *
 *   - The 6 generated columns from the entity
 *     (`shotType` / `bodyPart` / `cardType` / `injurySeverity` /
 *     `subPosition` / `penaltyOutcome`) — these are declared
 *     in the entity but were NEVER actually created in the
 *     DB (verified: the RFC 0003 migration only created
 *     `specialty_contributions` + `primary_specialty_code` +
 *     `primary_specialty_tier`). They're dead entity fields.
 *
 *   - The `MatchEventType` TypeScript enum — that's a TS-only
 *     construct, no PG `enum` type. After this migration, the
 *     enum becomes effectively dead code at the TS layer too
 *     — Phase 3 also removes the imports / references.
 */
export class DropMatchEventLegacyColumns1788000000002 implements MigrationInterface {
  name = 'DropMatchEventLegacyColumns1788000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop the legacy `type` int column. The DB column has
    //    no PG `enum` type — just `int` — so dropping the
    //    column is enough; no type migration needed.
    await queryRunner.query(`
      ALTER TABLE "match_event" DROP COLUMN IF EXISTS "type"
    `);

    // 2. Make event_class_id NOT NULL. The Phase 1 backfill
    //    covered all rows in dev (the 3,899 turnover rows
    //    were caught by the Phase 3 pre-check, fixed by the
    //    type=5 → SHOT+MISS mapping in
    //    1788000000001-CreateEventClassOutcomeDefs.ts, and
    //    re-backfilled). Phase 2's engine writes the new
    //    tuple for every event, so new rows always have a
    //    value.
    //
    //    Pre-check: every row must have a non-NULL
    //    event_class_id. If any row is still NULL, the
    //    migration aborts with a clear error rather than
    //    corrupting the table.
    const nullCount = await queryRunner.query(`
      SELECT COUNT(*)::int AS n
        FROM "match_event"
       WHERE "event_class_id" IS NULL
    `);
    if (nullCount[0].n > 0) {
      throw new Error(
        `[1788000000002] cannot set event_class_id NOT NULL: ` +
          `${nullCount[0].n} rows still have NULL. Re-run the ` +
          `Phase 1 backfill (SELECT match_event_backfill_class_outcome(NULL)) ` +
          `then retry this migration.`,
      );
    }

    // 3. Drop the CHK constraint that allowed NULL — now
    //    that event_class_id is NOT NULL, the constraint
    //    becomes redundant. We keep the range check
    //    (event_class_id BETWEEN 1 AND 100) for safety.
    await queryRunner.query(`
      ALTER TABLE "match_event" DROP CONSTRAINT IF EXISTS "chk_event_class_id_range"
    `);

    await queryRunner.query(`
      ALTER TABLE "match_event"
      ALTER COLUMN "event_class_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "match_event"
      ADD CONSTRAINT "chk_event_class_id_range"
      CHECK ("event_class_id" BETWEEN 1 AND 100)
    `);

    // 4. outcome_id / outcome_code stay nullable. The
    //    outcome-less classes (KICKOFF=1, OWN_GOAL=11,
    //    CELEBRATION=12, WEATHER=14, ATTENDANCE=15, SNAPSHOT=17)
    //    are designed to have NULL outcome_id. INJURY and
    //    SUBSTITUTION store their outcome in `data` JSONB
    //    (severity / tacticalReason), so the outcome_id
    //    may also be NULL for them.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Phase 3 down() is best-effort restore of the schema
    // (NOT the data). The engine no longer writes the
    // `type` int column, so a down() migration can only
    // re-add the column — a real rollback needs a DB
    // backup taken BEFORE this migration ran.
    await queryRunner.query(`
      ALTER TABLE "match_event"
      ADD COLUMN IF NOT EXISTS "type" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "match_event" DROP CONSTRAINT IF EXISTS "chk_event_class_id_range"
    `);
    await queryRunner.query(`
      ALTER TABLE "match_event"
      ALTER COLUMN "event_class_id" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "match_event"
      ADD CONSTRAINT "chk_event_class_id_range"
      CHECK ("event_class_id" IS NULL OR "event_class_id" BETWEEN 1 AND 100)
    `);
  }
}
