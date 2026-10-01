import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `specialty_contributions` to `match_event` for RFC 0003
 * (Specialty Attribution — see `docs/rfcs/0003-specialty-attribution.md`).
 *
 * The engine's specialty v2 system (`simulator/.../systems/specialty.system.ts`)
 * has 23 leaf multipliers that are applied at 22+ call sites. Until this
 * migration those multipliers were applied to the math and immediately
 * discarded — there was no record of "this event was influenced by
 * X's AERIAL_THREAT specialty". This migration makes the effect
 * observable end-to-end (DB queryable, FE surfaceable).
 *
 * ## Schema
 *
 *   - `specialty_contributions` (JSONB, nullable) — the canonical
 *     payload. An array of `{ playerId, specialtyCode, tier, effectKey,
 *     multiplier, role, isPrimary }` entries, one per specialty that
 *     fired on this event. Empty/missing = no specialty affected this
 *     event (the 99% case).
 *
 *   - `primary_specialty_code` (VARCHAR(32), GENERATED, STORED) —
 *     derived from `specialty_contributions->0->>'specialtyCode'`. The
 *     engine orders the array so index 0 is the *primary* contributor
 *     (per D8: "the person who triggered the outcome"). Indexed to
 *     answer "show me every goal where a Gold AERIAL_THREAT fired"
 *     without scanning JSONB.
 *
 *   - `primary_specialty_tier` (VARCHAR(8), GENERATED, STORED) —
 *     derived from `specialty_contributions->0->>'tier'`. Not
 *     indexed alone; it's there for FE display ("Gold 空霸") so the
 *     FE doesn't have to re-parse JSONB on every render.
 *
 * ## Indexes
 *
 *   - `idx_event_primary_specialty` (partial B-tree on
 *     `primary_specialty_code WHERE NOT NULL`) — answers
 *     "all events where a specialty fired" cheaply. Partial because
 *     most events have no contribution (~90% of rows will be NULL).
 *
 *   - `idx_player_specialty_fires` (partial B-tree on
 *     `(player_id, primary_specialty_code) WHERE NOT NULL`) —
 *     powers the post-match "this player triggered specialty X times"
 *     aggregation the FE will need. Even though D6=B defers the
 *     post-match summary UI, the index is cheap and a future P2
 *     reader needs it.
 *
 *   - `idx_event_specialty_gin` (partial GIN on
 *     `specialty_contributions jsonb_path_ops WHERE NOT NULL`) —
 *     powers deep JSONB queries like "all events where AERIAL_THREAT
 *     fired on `shot_header`" via `@>` containment. `jsonb_path_ops`
 *     is half the size of the default GIN and only supports
 *     containment — that's the only operator we need.
 *
 * ## Why STORED (not VIRTUAL) generated columns
 *
 *   STORED lets the partial B-tree index reference the column. PG
 *   disallows indexing VIRTUAL generated columns. Storage cost is
 *   ~40 bytes/row for the 90% NULL rows, 0 cost.
 *
 * ## Idempotency
 *
 *   All operations use IF NOT EXISTS so a re-run against a DB that's
 *   already been migrated is a no-op. The companion spec file
 *   (`*.spec.ts`) source-greps for these clauses.
 */
export class AddMatchEventSpecialtyContributions1788000000000 implements MigrationInterface {
  name = 'AddMatchEventSpecialtyContributions1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Canonical JSONB column
    await queryRunner.query(`
      ALTER TABLE "match_event"
      ADD COLUMN IF NOT EXISTS "specialty_contributions" jsonb NULL
    `);

    // 2. Generated columns — primary contributor's code + tier, fast
    //    indexed access without re-parsing JSONB
    await queryRunner.query(`
      ALTER TABLE "match_event"
      ADD COLUMN IF NOT EXISTS "primary_specialty_code" varchar(32)
      GENERATED ALWAYS AS ((specialty_contributions->0->>'specialtyCode')) STORED
    `);
    await queryRunner.query(`
      ALTER TABLE "match_event"
      ADD COLUMN IF NOT EXISTS "primary_specialty_tier" varchar(8)
      GENERATED ALWAYS AS ((specialty_contributions->0->>'tier')) STORED
    `);

    // 3. Partial B-tree on primary code — "events where a specialty fired"
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_event_primary_specialty"
      ON "match_event" ("primary_specialty_code")
      WHERE "primary_specialty_code" IS NOT NULL
    `);

    // 4. Partial B-tree on (player, code) — "X player's specialty fired"
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_player_specialty_fires"
      ON "match_event" ("player_id", "primary_specialty_code")
      WHERE "primary_specialty_code" IS NOT NULL
    `);

    // 5. Partial GIN for deep JSONB queries ("AERIAL_THREAT fired on shot_header")
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_event_specialty_gin"
      ON "match_event" USING GIN ("specialty_contributions" jsonb_path_ops)
      WHERE "specialty_contributions" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse FK order — no FKs here, but indexes first then
    // generated columns then the canonical column.
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_event_specialty_gin"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_player_specialty_fires"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_event_primary_specialty"`,
    );
    await queryRunner.query(
      `ALTER TABLE "match_event" DROP COLUMN IF EXISTS "primary_specialty_tier"`,
    );
    await queryRunner.query(
      `ALTER TABLE "match_event" DROP COLUMN IF EXISTS "primary_specialty_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "match_event" DROP COLUMN IF EXISTS "specialty_contributions"`,
    );
  }
}
