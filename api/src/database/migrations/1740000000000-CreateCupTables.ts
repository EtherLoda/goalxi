import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the 4 cup-competition tables backing the GoalXI National
 * Cup. Schema mirrors the entity classes in
 * `libs/database/src/entities/cup*.entity.ts`. See those files
 * for per-column rationale.
 *
 * ## Why 4 tables instead of 1
 *
 *   - `cup`            — the competition itself (1 row per season)
 *   - `cup_round`      — round metadata (12 rows per cup for L1-L4 MVP)
 *   - `cup_entry`      — per-team participation (1 row per team per cup)
 *   - `cup_bracket_slot` — pairing slots within a round, including
 *                          byes (which have no `match` row)
 *
 * Splitting `cup_bracket_slot` from `cup_round` lets us address a
 * specific slot (e.g. "the slot that the L1 winner came from in R9")
 * without joining through matches. The slot also carries the
 * cross-round traceability (`source_slot_id`) the FE bracket view
 * needs to render "team X beat team Y in R3 to reach this slot".
 *
 * ## Index strategy
 *
 *   - `cup(season, type)` unique — one cup per (season, type)
 *     tuple. The MVP only has `NATIONAL`; future cups (SENIOR,
 *     TROPHY, VASE) reuse the same table with a different `type`.
 *   - `cup_round(cup_id, round_number)` unique — round numbering
 *     restarts at 0 per cup.
 *   - `cup_entry(cup_id, team_id)` unique — a team is either in
 *     the cup or not, no double entries.
 *   - `cup_bracket_slot(cup_id, round_id, slot_index)` unique —
 *     slot positions are deterministic and idempotent.
 *
 * Partial / functional indexes are deliberately NOT added in this
 * migration. The cup-competition table is small (~2000 rows in R0,
 * halving every round) and the basic B-tree indexes cover every
 * query path the API exposes. Add indexes only if a specific
 * query shows up in the slow-query log.
 *
 * ## Idempotency
 *
 * `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` make
 * re-runs a no-op. The original Phase 1 commit only added the
 * TypeScript entity classes; this migration is the first DB write
 * for cup data.
 */
export class CreateCupTables1740000000000 implements MigrationInterface {
  name = 'CreateCupTables1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- cup ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cup" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "season" int NOT NULL,
        "type" varchar(32) NOT NULL,
        "name" varchar(128) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'pending',
        "prize_currency" varchar(8) NOT NULL DEFAULT 'CNY',
        "prize_pool" bigint NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_cup_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_cup_status" CHECK ("status" IN ('pending', 'in_progress', 'completed', 'cancelled'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cup_season_type" ON "cup" ("season", "type")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cup_season" ON "cup" ("season")
    `);

    // --- cup_round ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cup_round" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cup_id" uuid NOT NULL,
        "round_number" int NOT NULL,
        "round_name" varchar(64) NOT NULL,
        "kind" varchar(16) NOT NULL DEFAULT 'qualifying',
        "status" varchar(16) NOT NULL DEFAULT 'pending',
        "slot_count" int NOT NULL DEFAULT 0,
        "tactics_deadline" timestamptz,
        "scheduled_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_cup_round_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cup_round_cup" FOREIGN KEY ("cup_id") REFERENCES "cup"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_cup_round_kind" CHECK ("kind" IN ('qualifying', 'proper', 'knockout', 'final')),
        CONSTRAINT "CHK_cup_round_status" CHECK ("status" IN ('pending', 'in_progress', 'completed'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cup_round_cup_roundnumber"
        ON "cup_round" ("cup_id", "round_number")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cup_round_cup_id" ON "cup_round" ("cup_id")
    `);

    // --- cup_entry ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cup_entry" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cup_id" uuid NOT NULL,
        "team_id" uuid NOT NULL,
        "entry_round" int NOT NULL,
        "source_league_id" uuid,
        "tier" int NOT NULL,
        "seed_rank" int NOT NULL DEFAULT 0,
        "elo_snapshot" int NOT NULL DEFAULT 1500,
        "eliminated_in_round" int,
        "final_position" int,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_cup_entry_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cup_entry_cup" FOREIGN KEY ("cup_id") REFERENCES "cup"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cup_entry_team" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cup_entry_league" FOREIGN KEY ("source_league_id") REFERENCES "league"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_cup_entry_tier_positive" CHECK ("tier" >= 1),
        CONSTRAINT "CHK_cup_entry_seed_positive" CHECK ("seed_rank" >= 0),
        CONSTRAINT "CHK_cup_entry_elo_range" CHECK ("elo_snapshot" BETWEEN 0 AND 5000)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cup_entry_cup_team"
        ON "cup_entry" ("cup_id", "team_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cup_entry_cup_entryround"
        ON "cup_entry" ("cup_id", "entry_round")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cup_entry_team"
        ON "cup_entry" ("team_id")
    `);

    // --- cup_bracket_slot ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cup_bracket_slot" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cup_id" uuid NOT NULL,
        "round_id" uuid NOT NULL,
        "round_number" int NOT NULL,
        "slot_index" int NOT NULL,
        "home_team_id" uuid,
        "away_team_id" uuid,
        "match_id" uuid,
        "winner_team_id" uuid,
        "source_slot_id" uuid,
        "is_bye" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_cup_bracket_slot_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cup_bracket_slot_cup" FOREIGN KEY ("cup_id") REFERENCES "cup"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cup_bracket_slot_round" FOREIGN KEY ("round_id") REFERENCES "cup_round"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cup_bracket_slot_home" FOREIGN KEY ("home_team_id") REFERENCES "team"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_cup_bracket_slot_away" FOREIGN KEY ("away_team_id") REFERENCES "team"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_cup_bracket_slot_match" FOREIGN KEY ("match_id") REFERENCES "match"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_cup_bracket_slot_winner" FOREIGN KEY ("winner_team_id") REFERENCES "team"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_cup_bracket_slot_source" FOREIGN KEY ("source_slot_id") REFERENCES "cup_bracket_slot"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_cup_bracket_slot_isbye" CHECK (
          (NOT "is_bye") OR ("is_bye" AND "home_team_id" IS NOT NULL AND "away_team_id" IS NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cup_bracket_slot_cup_round_slot"
        ON "cup_bracket_slot" ("cup_id", "round_id", "slot_index")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cup_bracket_slot_cup_round_hometeam"
        ON "cup_bracket_slot" ("cup_id", "round_id", "home_team_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cup_bracket_slot_cup_round_awayteam"
        ON "cup_bracket_slot" ("cup_id", "round_id", "away_team_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse FK order. Cascading drops aren't used here
    // because the FKs in the up() block keep the children
    // consistent — dropping the parent drops the children via
    // ON DELETE CASCADE in PostgreSQL. Order matters because the
    // FKs reference each other.
    await queryRunner.query(`DROP TABLE IF EXISTS "cup_bracket_slot"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cup_entry"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cup_round"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cup"`);
  }
}
