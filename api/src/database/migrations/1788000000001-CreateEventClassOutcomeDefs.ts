import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RFC 0002 — Phase 1 (event two-axis coding, schema only).
 *
 * Adds the dictionary tables (`event_class_def` / `event_outcome_def`)
 * and the new columns on `match_event` (`event_class_id` /
 * `outcome_id` / `outcome_code` + 4 generated outcome columns).
 *
 * This migration is **additive only** — it does not drop any
 * column, does not change the engine, and does not change the
 * reader path. The legacy `type` int + `typeName` string columns
 * stay untouched for the 1-week Phase 1 soak period so we can
 * validate the new schema on production data before any
 * consumer switches over.
 *
 * ## Schema
 *
 *   `event_class_def`
 *     id          SMALLINT PK  (stable int, D3)
 *     code        VARCHAR(32)  'SHOT' 'FOUL' 'CARD' ...
 *     family      VARCHAR(16)  'positive' / 'negative' / 'neutral' / 'period'
 *     outcomes    SMALLINT[]   D4: allowed outcome ids for this class
 *     is_visible  BOOLEAN      SK/MATCH_START etc. hidden from FE
 *     sort_order  SMALLINT     for stable FE rendering
 *     description JSONB        D5: { zh, en, ... } i18n copy
 *
 *   `event_outcome_def`
 *     id           SMALLINT PK
 *     code         VARCHAR(32)  'GOAL' 'SAVE' 'BLOCKED' ...
 *     is_positive  BOOLEAN      "对我方有利" 过滤
 *     is_countable BOOLEAN      是否进 stats
 *     sort_order   SMALLINT
 *     description  JSONB
 *
 *   `match_event` (additive)
 *     event_class_id  SMALLINT NULL  -- the class
 *     outcome_id      SMALLINT NULL  -- the outcome (NULL when class has no outcome)
 *     outcome_code    VARCHAR(32) NULL  -- denormalized stable string for FE
 *     shot_outcome     VARCHAR(16) GENERATED  -- outcome_code when class=SHOT
 *     foul_outcome     VARCHAR(16) GENERATED  -- outcome_code when class=FOUL
 *     corner_outcome   VARCHAR(16) GENERATED  -- outcome_code when class=CORNER
 *     free_kick_outcome VARCHAR(16) GENERATED -- outcome_code when class=FREE_KICK
 *
 *   `match_event_backfill_class_outcome(p_match_id uuid DEFAULT NULL)`
 *     SQL function that backfills the 3 new columns from the
 *     legacy `type` int. Returns the row count updated. Idempotent
 *     (skips rows where `event_class_id IS NOT NULL`).
 *
 * ## Idempotency
 *
 *   All `CREATE TABLE` / `CREATE INDEX` / `ADD COLUMN` use the
 *   `IF NOT EXISTS` / `OR REPLACE` variant so a re-run against
 *   a partially-migrated DB is a no-op. The seed INSERTs use
 *   `ON CONFLICT (id) DO NOTHING` so re-seeding the same IDs
 *   is safe.
 *
 * ## Down migration
 *
 *   Drops the 3 function + 2 tables in reverse dependency order.
 *   The 3 columns + 4 generated columns on `match_event` are
 *   dropped LAST. **This is destructive on data** — running
 *   `down` in production is a no-go once any consumer has
 *   read the new columns.
 */
export class CreateEventClassOutcomeDefs1788000000001 implements MigrationInterface {
  name = 'CreateEventClassOutcomeDefs1788000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // =============================================================
    // 1. Dictionary tables
    // =============================================================

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "event_class_def" (
        "id" SMALLINT NOT NULL,
        "code" VARCHAR(32) NOT NULL,
        "family" VARCHAR(16) NOT NULL,
        "outcomes" SMALLINT[] NOT NULL DEFAULT '{}',
        "is_visible" BOOLEAN NOT NULL DEFAULT TRUE,
        "sort_order" SMALLINT NOT NULL,
        "description" JSONB NOT NULL,
        CONSTRAINT "PK_event_class_def" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_event_class_def_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "event_outcome_def" (
        "id" SMALLINT NOT NULL,
        "code" VARCHAR(32) NOT NULL,
        "is_positive" BOOLEAN NOT NULL,
        "is_countable" BOOLEAN NOT NULL,
        "sort_order" SMALLINT NOT NULL,
        "description" JSONB NOT NULL,
        CONSTRAINT "PK_event_outcome_def" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_event_outcome_def_code" UNIQUE ("code")
      )
    `);

    // =============================================================
    // 2. Seed event_class_def (17 rows)
    // =============================================================
    // Source of truth for class ids. Stable across dev/staging/prod
    // per D3 (no SERIAL). Idempotent via ON CONFLICT.

    await queryRunner.query(`
      INSERT INTO "event_class_def" ("id", "code", "family", "outcomes", "is_visible", "sort_order", "description") VALUES
        ( 1, 'KICKOFF',       'neutral', ARRAY[]::SMALLINT[],                                        TRUE,  10, '{"zh":"开球","en":"Kick-off"}'),
        ( 2, 'PERIOD',        'period',   ARRAY[26,27]::SMALLINT[],                                   TRUE,  20, '{"zh":"时段","en":"Period"}'),
        ( 3, 'SHOT',          'positive', ARRAY[1,2,3,4]::SMALLINT[],                                 TRUE,  30, '{"zh":"射门","en":"Shot"}'),
        ( 4, 'FOUL',          'negative', ARRAY[5,6,7,8,9]::SMALLINT[],                               TRUE,  40, '{"zh":"犯规","en":"Foul"}'),
        ( 5, 'FREE_KICK',     'neutral',  ARRAY[10,11,12]::SMALLINT[],                                TRUE,  50, '{"zh":"任意球","en":"Free kick"}'),
        ( 6, 'CORNER',        'neutral',  ARRAY[10,11]::SMALLINT[],                                  TRUE,  60, '{"zh":"角球","en":"Corner"}'),
        ( 7, 'PENALTY',       'positive', ARRAY[1,4,13]::SMALLINT[],                                 TRUE,  70, '{"zh":"点球","en":"Penalty"}'),
        ( 8, 'SUBSTITUTION',  'neutral',  ARRAY[14,15,16]::SMALLINT[],                               TRUE,  80, '{"zh":"换人","en":"Substitution"}'),
        ( 9, 'INJURY',        'negative', ARRAY[17,18]::SMALLINT[],                                 TRUE,  90, '{"zh":"伤病","en":"Injury"}'),
        (10, 'VAR',           'neutral',  ARRAY[19,20,21,22,23]::SMALLINT[],                          TRUE, 100, '{"zh":"VAR","en":"VAR decision"}'),
        (11, 'OWN_GOAL',      'positive', ARRAY[]::SMALLINT[],                                        TRUE, 110, '{"zh":"乌龙球","en":"Own goal"}'),
        (12, 'CELEBRATION',   'positive', ARRAY[]::SMALLINT[],                                        TRUE, 120, '{"zh":"庆祝","en":"Celebration"}'),
        (13, 'LINEUP',        'neutral',  ARRAY[24,25]::SMALLINT[],                                  TRUE, 130, '{"zh":"出场名单","en":"Lineup"}'),
        (14, 'WEATHER',       'neutral',  ARRAY[]::SMALLINT[],                                        TRUE, 140, '{"zh":"天气","en":"Weather"}'),
        (15, 'ATTENDANCE',    'neutral',  ARRAY[]::SMALLINT[],                                        TRUE, 150, '{"zh":"上座","en":"Attendance"}'),
        (16, 'MATCH_META',    'period',   ARRAY[26,27,28]::SMALLINT[],                                TRUE, 160, '{"zh":"比赛元信息","en":"Match meta"}'),
        (17, 'SNAPSHOT',      'neutral',  ARRAY[]::SMALLINT[],                                        FALSE, 990, '{"zh":"快照","en":"Snapshot"}')
      ON CONFLICT ("id") DO NOTHING
    `);

    // =============================================================
    // 3. Seed event_outcome_def (28 rows)
    // =============================================================

    await queryRunner.query(`
      INSERT INTO "event_outcome_def" ("id", "code", "is_positive", "is_countable", "sort_order", "description") VALUES
        ( 1, 'GOAL',             TRUE,  TRUE,  10, '{"zh":"进球","en":"Goal"}'),
        ( 2, 'SAVE',             TRUE,  TRUE,  20, '{"zh":"扑救","en":"Save"}'),
        ( 3, 'BLOCKED',          FALSE, TRUE,  30, '{"zh":"封堵","en":"Blocked"}'),
        ( 4, 'MISS',             FALSE, TRUE,  40, '{"zh":"射偏","en":"Miss"}'),
        ( 5, 'WARNING',          FALSE, FALSE, 50, '{"zh":"口头警告","en":"Warning"}'),
        ( 6, 'YELLOW',           FALSE, TRUE,  60, '{"zh":"黄牌","en":"Yellow card"}'),
        ( 7, 'SECOND_YELLOW',    FALSE, TRUE,  70, '{"zh":"第二张黄牌","en":"Second yellow"}'),
        ( 8, 'RED',              FALSE, TRUE,  80, '{"zh":"红牌","en":"Red card"}'),
        ( 9, 'PENALTY_AWARDED',  FALSE, TRUE,  90, '{"zh":"判罚点球","en":"Penalty awarded"}'),
        (10, 'AWARDED',          FALSE, FALSE,100, '{"zh":"判给","en":"Awarded"}'),
        (11, 'TAKEN',            FALSE, TRUE, 110, '{"zh":"开出","en":"Taken"}'),
        (12, 'DIRECT_GOAL',      TRUE,  TRUE, 120, '{"zh":"直接任意球破门","en":"Direct free-kick goal"}'),
        (13, 'SAVED',            TRUE,  TRUE, 130, '{"zh":"点球扑出","en":"Penalty saved"}'),
        (14, 'TACTICAL',         TRUE,  FALSE,140, '{"zh":"战术调整","en":"Tactical"}'),
        (15, 'SUB_INJURY',       TRUE,  FALSE,150, '{"zh":"因伤换人","en":"Injury sub"}'),
        (16, 'SUB_TIRED',        TRUE,  FALSE,160, '{"zh":"体能换人","en":"Tiredness sub"}'),
        (17, 'INJURY_MILD',      FALSE, TRUE, 170, '{"zh":"轻伤","en":"Mild injury"}'),
        (18, 'INJURY_SEVERE',    FALSE, TRUE, 180, '{"zh":"重伤","en":"Severe injury"}'),
        (19, 'GOAL_AWARDED',     TRUE,  TRUE, 190, '{"zh":"进球有效","en":"Goal awarded"}'),
        (20, 'GOAL_DENIED',      FALSE, TRUE, 200, '{"zh":"进球无效","en":"Goal denied"}'),
        (21, 'PENALTY_DENIED',   FALSE, TRUE, 210, '{"zh":"点球取消","en":"Penalty denied"}'),
        (22, 'RED_CARD',         FALSE, TRUE, 220, '{"zh":"红牌罚下","en":"Red card via VAR"}'),
        (23, 'CANCELLED',        FALSE, FALSE,230, '{"zh":"取消","en":"Cancelled"}'),
        (24, 'HOME',             TRUE,  FALSE,240, '{"zh":"主队","en":"Home"}'),
        (25, 'AWAY',             TRUE,  FALSE,250, '{"zh":"客队","en":"Away"}'),
        (26, 'START',            TRUE,  FALSE,260, '{"zh":"开始","en":"Start"}'),
        (27, 'END',              FALSE, FALSE,270, '{"zh":"结束","en":"End"}'),
        (28, 'FORFEIT',          FALSE, TRUE, 280, '{"zh":"弃权","en":"Forfeit"}')
      ON CONFLICT ("id") DO NOTHING
    `);

    // =============================================================
    // 4. match_event: 3 core columns + CHECK
    // =============================================================

    await queryRunner.query(`
      ALTER TABLE "match_event"
      ADD COLUMN IF NOT EXISTS "event_class_id" SMALLINT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "match_event"
      ADD COLUMN IF NOT EXISTS "outcome_id" SMALLINT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "match_event"
      ADD COLUMN IF NOT EXISTS "outcome_code" VARCHAR(32) NULL
    `);

    // CHECK 范围（让字典表可换，但不能瞎填）— DO block 让 IF NOT EXISTS
    // 多次跑兼容。PG 没原生 IF NOT EXISTS for CHECK；用 pg_constraint 查。
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chk_event_class_id_range'
        ) THEN
          ALTER TABLE "match_event"
            ADD CONSTRAINT "chk_event_class_id_range"
            CHECK ("event_class_id" IS NULL OR "event_class_id" BETWEEN 1 AND 100);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chk_outcome_id_range'
        ) THEN
          ALTER TABLE "match_event"
            ADD CONSTRAINT "chk_outcome_id_range"
            CHECK ("outcome_id" IS NULL OR "outcome_id" BETWEEN 1 AND 100);
        END IF;
      END$$
    `);

    // =============================================================
    // 5. match_event: 4 generated outcome columns
    // =============================================================
    // D2 = FOUL 合并 CARD, so:
    //   class SHOT=3     → shot_outcome
    //   class FOUL=4     → foul_outcome
    //   class CORNER=6   → corner_outcome
    //   class FREE_KICK=5 → free_kick_outcome
    //
    // Implementation note: STORED generated columns in PG
    // cannot contain subqueries. The original v1 of this
    // migration tried `(SELECT code FROM event_outcome_def
    // WHERE id = match_event.outcome_id)` which failed with
    // "cannot use subquery in column generation expression".
    // The fix is to derive directly from the row's own
    // `outcome_code` column (which is denormalized at write
    // time by the engine's processor). Consistency between
    // `outcome_id` and `outcome_code` is the engine's
    // responsibility (via `getEventTwoAxis` in
    // `libs/database/src/constants/event-two-axis.ts`); the
    // generated columns just surface the right slice.
    //
    // STORED 是因为 PG 禁止在 VIRTUAL generated column 上建索引
    // (虽然这 4 列本身没被索引, 但留出未来空间且零额外成本)

    await queryRunner.query(`
      ALTER TABLE "match_event"
      ADD COLUMN IF NOT EXISTS "shot_outcome" VARCHAR(16)
      GENERATED ALWAYS AS (
        CASE WHEN "event_class_id" = 3
             THEN "outcome_code"
             ELSE NULL END
      ) STORED
    `);

    await queryRunner.query(`
      ALTER TABLE "match_event"
      ADD COLUMN IF NOT EXISTS "foul_outcome" VARCHAR(16)
      GENERATED ALWAYS AS (
        CASE WHEN "event_class_id" = 4
             THEN "outcome_code"
             ELSE NULL END
      ) STORED
    `);

    await queryRunner.query(`
      ALTER TABLE "match_event"
      ADD COLUMN IF NOT EXISTS "corner_outcome" VARCHAR(16)
      GENERATED ALWAYS AS (
        CASE WHEN "event_class_id" = 6
             THEN "outcome_code"
             ELSE NULL END
      ) STORED
    `);

    await queryRunner.query(`
      ALTER TABLE "match_event"
      ADD COLUMN IF NOT EXISTS "free_kick_outcome" VARCHAR(16)
      GENERATED ALWAYS AS (
        CASE WHEN "event_class_id" = 5
             THEN "outcome_code"
             ELSE NULL END
      ) STORED
    `);

    // =============================================================
    // 6. Indexes
    // =============================================================
    // Partial B-tree on (class, outcome) for the most common
    // stats query: "all SHOT events with outcome GOAL".
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_event_class_outcome"
      ON "match_event" ("event_class_id", "outcome_id")
      WHERE "event_class_id" IS NOT NULL
    `);

    // Partial B-tree on (player, class, outcome) for the
    // per-player stats query path. The Phase 2 engine spec
    // already builds queries of this shape.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_player_class_outcome"
      ON "match_event" ("player_id", "event_class_id", "outcome_id")
      WHERE "player_id" IS NOT NULL
        AND "event_class_id" IS NOT NULL
    `);

    // =============================================================
    // 7. Backfill function
    // =============================================================
    // The function maps the legacy `type` int enum to the new
    // (class_id, outcome_id) tuple. It's idempotent: re-running
    // on the same row is a no-op because the WHERE clause
    // filters out rows that already have event_class_id set.
    //
    // Only the 20 actively-emitted enum values are mapped here.
    // The 10 dead enum values (TACKLE=6, INTERCEPTION=7,
    // CLEARANCE=28, OFFSIDE=16, NEUTRAL_EVENT=27, DIRECT_FREE_KICK=181,
    // CELEBRATION=26, VAR_DECISION=30, OWN_GOAL=29, SECOND_YELLOW=101)
    // are NOT in the CASE — they exist in the enum but no live
    // engine path emits them (verified by searching for the
    // `type: '...'` literal across the simulator's emit sites).
    // Their rows, if any exist (they shouldn't outside of test
    // data), keep event_class_id NULL. See RFC 0002 §4.2
    // "Note on dead enum entries" for the Phase 3 cleanup
    // plan (drop enum type entirely when the `type` int
    // column is dropped).
    //
    // Important: `type=5` (PASS) is NOT dead. The engine emits
    // `'turnover'` for failed attack pushes (the simulator's
    // emit site for the attack-push fail case), and the
    // processor's `mapEventType` translates that string to
    // `MatchEventType.PASS=5`. So `type=5` rows ARE live
    // data; we just need to give them a real class. Per the
    // TS `EVENT_TWO_AXIS` mirror
    // (libs/database/src/constants/event-two-axis.ts),
    // `turnover` maps to class=SHOT(3) + outcome=MISS(4).
    // Fixed 2026-08-24 after the Phase 3 migration's
    // pre-check caught 3,899 legacy rows with NULL
    // event_class_id that should have been SHOT+MISS.

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "match_event_backfill_class_outcome"(
        "p_match_id" uuid DEFAULT NULL
      )
      RETURNS integer
      AS $$
      DECLARE
        "v_count" integer;
      BEGIN
        -- Pass 1: event_class_id + outcome_id from the legacy type
        -- int. We do NOT touch outcome_code in the same UPDATE
        -- because PG's UPDATE doesn't guarantee the right side of
        -- a multi-column SET sees the new values of the left side
        -- — the CASE on outcome_id would read the pre-update NULL
        -- and produce NULL outcome_code for every row. Splitting
        -- into two UPDATEs is the cleanest fix; the second sees
        -- the now-populated outcome_id.
        UPDATE "match_event" SET
          "event_class_id" = CASE "type"
            WHEN 1   THEN 1
            WHEN 2   THEN 3
            WHEN 3   THEN 3
            WHEN 4   THEN 3
            WHEN 5   THEN 3
            WHEN 8   THEN 3
            WHEN 9   THEN 4
            WHEN 10  THEN 4
            WHEN 11  THEN 4
            WHEN 12  THEN 8
            WHEN 13  THEN 2
            WHEN 14  THEN 2
            WHEN 15  THEN 9
            WHEN 17  THEN 6
            WHEN 18  THEN 5
            WHEN 19  THEN 7
            WHEN 20  THEN 16
            WHEN 21  THEN 17
            WHEN 22  THEN 16
            WHEN 23  THEN 2
            WHEN 24  THEN 2
            WHEN 25  THEN 2
            WHEN 29  THEN 11
            WHEN 30  THEN 10
            WHEN 31  THEN 7
            WHEN 32  THEN 14
            WHEN 33  THEN 13
            WHEN 34  THEN 15
            -- Legacy hack: SECOND_YELLOW=101 and DIRECT_FREE_KICK=181
            -- share the parent event id. They DO exist in test data.
            WHEN 101 THEN 4
            WHEN 181 THEN 5
            ELSE NULL
          END,
          "outcome_id" = CASE "type"
            WHEN 2   THEN 1
            WHEN 3   THEN NULL
            WHEN 4   THEN 4
            WHEN 5   THEN 4
            WHEN 8   THEN 2
            WHEN 9   THEN 5
            WHEN 10  THEN 6
            WHEN 11  THEN 8
            WHEN 17  THEN 11
            WHEN 18  THEN 11
            WHEN 19  THEN 1
            WHEN 20  THEN 28
            WHEN 22  THEN 26
            WHEN 23  THEN 26
            WHEN 24  THEN 26
            WHEN 25  THEN 26
            WHEN 31  THEN 4
            -- Legacy hack
            WHEN 101 THEN 7
            WHEN 181 THEN 12
            ELSE NULL
          END
        WHERE ("p_match_id" IS NULL OR "match_id" = "p_match_id")
          AND "event_class_id" IS NULL;
        GET DIAGNOSTICS "v_count" = ROW_COUNT;

        -- Pass 2: outcome_code derived from the now-populated
        -- outcome_id. Joins event_outcome_def via subquery to
        -- keep the code authoritative (the dict table is the
        -- source of truth for code ↔ id mapping).
        UPDATE "match_event" m
        SET "outcome_code" = (
          SELECT "code" FROM "event_outcome_def"
          WHERE "id" = m."outcome_id"
        )
        WHERE ("p_match_id" IS NULL OR m."match_id" = "p_match_id")
          AND m."outcome_id" IS NOT NULL
          AND m."outcome_code" IS NULL;

        RETURN "v_count";
      END;
      $$ LANGUAGE plpgsql
    `);

    // =============================================================
    // 8. Run the backfill once for all existing rows.
    // =============================================================
    // Idempotent — second call returns 0.
    await queryRunner.query(`
      SELECT "match_event_backfill_class_outcome"(NULL)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse dependency order: function first (depends
    // on the tables), then tables, then match_event columns.
    // The match_event columns must be dropped BEFORE the dict
    // tables because the generated columns reference them.
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "match_event_backfill_class_outcome"(uuid)`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_player_class_outcome"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_event_class_outcome"`);
    await queryRunner.query(`
      ALTER TABLE "match_event" DROP COLUMN IF EXISTS "free_kick_outcome"
    `);
    await queryRunner.query(`
      ALTER TABLE "match_event" DROP COLUMN IF EXISTS "corner_outcome"
    `);
    await queryRunner.query(`
      ALTER TABLE "match_event" DROP COLUMN IF EXISTS "foul_outcome"
    `);
    await queryRunner.query(`
      ALTER TABLE "match_event" DROP COLUMN IF EXISTS "shot_outcome"
    `);
    await queryRunner.query(`
      ALTER TABLE "match_event" DROP CONSTRAINT IF EXISTS "chk_outcome_id_range"
    `);
    await queryRunner.query(`
      ALTER TABLE "match_event" DROP CONSTRAINT IF EXISTS "chk_event_class_id_range"
    `);
    await queryRunner.query(`
      ALTER TABLE "match_event" DROP COLUMN IF EXISTS "outcome_code"
    `);
    await queryRunner.query(`
      ALTER TABLE "match_event" DROP COLUMN IF EXISTS "outcome_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "match_event" DROP COLUMN IF EXISTS "event_class_id"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "event_outcome_def"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "event_class_def"`);
  }
}
