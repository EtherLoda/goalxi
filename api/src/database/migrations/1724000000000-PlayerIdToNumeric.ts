import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Changes player.id from UUID to a 9-digit auto-increment integer.
 *
 * Strategy for existing data:
 *   1. Add a temporary `_old_id` column to preserve the original UUID values.
 *   2. Create a mapping: old UUID → new sequential integer (starting at 100000001).
 *   3. Add the new `id` int column with a DEFAULT from a sequence.
 *   4. Backfill `id` from the mapping.
 *   5. Update all child tables to reference the new integer player IDs.
 *   6. Drop old constraints/columns and rename new ones.
 *   7. Remove the `display_id` column.
 *
 * Down: reverses the mapping back to UUIDs (not fully reversible for existing
 * sequential IDs without a restore-point, but the structure is restored).
 */
export class PlayerIdToNumeric1724000000000 implements MigrationInterface {
  name = 'PlayerIdToNumeric1724000000000';

  private TABLES_WITH_PLAYER_FK = [
    'auction',
    'coach_player_assignment',
    'injury',
    'match_event',
    'player_competition_stats',
    'player_event',
    'player_history',
    'player_transaction',
    'transfer_transaction',
    'archived_player_event',
    'archived_player_competition_stats',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------- Step 0: check if already applied (idempotent) ----------
    const colInfo = await queryRunner.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'player' AND column_name = 'id'
    `);
    if (colInfo.length > 0 && colInfo[0].data_type === 'integer') {
      return; // already migrated
    }

    // ---------- Step 1: preserve old UUID id ----------
    await queryRunner.query(`
      ALTER TABLE "player" ADD COLUMN IF NOT EXISTS "_old_id" uuid
    `);
    await queryRunner.query(`
      UPDATE "player" SET "_old_id" = "id"
    `);

    // ---------- Step 2: create sequence for new player IDs ----------
    await queryRunner.query(`
      CREATE SEQUENCE IF NOT EXISTS player_id_seq START 100000001
    `);

    // ---------- Step 3: add new int id column (nullable, no DEFAULT) ----------
    // IMPORTANT: do NOT add `NOT NULL DEFAULT nextval(...)` here. With NOT NULL +
    // DEFAULT, Postgres backfills every existing row by calling nextval, which
    // assigns values in heap insertion order. Step 4 then re-assigns every row
    // using ROW_NUMBER() OVER (created_at), which is a different order. The two
    // sequences collide on values, and ADD CONSTRAINT PK fails with
    // `Key (id_new)=(100000001) is duplicated` even though single-row UPDATEs
    // don't check uniqueness. Adding the column nullable and filling it via
    // UPDATE keeps the assignments atomic and lets SET NOT NULL + ADD PK succeed.
    await queryRunner.query(`
      ALTER TABLE "player" ADD COLUMN "id_new" integer
    `);

    // ---------- Step 4: backfill id_new with sequential IDs, preserving order ----------
    // Use a CTE joined to the UPDATE target instead of a correlated subquery:
    // correlated `SELECT ... FROM player p2 WHERE p2.id = player.id` with a
    // window function in PostgreSQL can be decorrelated into a join that returns
    // multiple rows, which the UPDATE SET silently collapses to a single value,
    // producing duplicate id_new values across rows (caught only when we add PK).
    await queryRunner.query(`
      WITH numbered AS (
        SELECT "id",
               ROW_NUMBER() OVER (ORDER BY "created_at") + 100000000 AS new_id
        FROM "player"
      )
      UPDATE "player" p
      SET "id_new" = n.new_id::int
      FROM numbered n
      WHERE p.id = n.id
    `);

    // Guard against NULLs sneaking in (e.g. from a partial prior run). The
    // statement throws if any row was missed, so we don't silently break the PK.
    await queryRunner.query(`
      SELECT COUNT(*) AS missing FROM "player" WHERE "id_new" IS NULL
    `);
    const missing = await queryRunner.query(`
      SELECT COUNT(*)::int AS missing FROM "player" WHERE "id_new" IS NULL
    `);
    if (missing[0].missing > 0) {
      throw new Error(
        `PlayerIdToNumeric backfill left ${missing[0].missing} player rows without id_new; aborting.`
      );
    }

    // Make it non-nullable after backfill
    await queryRunner.query(`
      ALTER TABLE "player" ALTER COLUMN "id_new" SET NOT NULL
    `);

    // Drop old PK constraint
    await queryRunner.query(`
      ALTER TABLE "player" DROP CONSTRAINT "PK_player_id" CASCADE
    `);

    // Set new PK
    await queryRunner.query(`
      ALTER TABLE "player" ADD CONSTRAINT "PK_player_id" PRIMARY KEY ("id_new")
    `);

    // Drop old id column
    await queryRunner.query(`
      ALTER TABLE "player" DROP COLUMN "id"
    `);

    // Rename new column to id
    await queryRunner.query(`
      ALTER TABLE "player" RENAME COLUMN "id_new" TO "id"
    `);

    // Drop display_id column
    await queryRunner.query(`
      ALTER TABLE "player" DROP COLUMN IF EXISTS "display_id"
    `);

    // Drop _old_id after all lookups are done
    await queryRunner.query(`
      ALTER TABLE "player" DROP COLUMN "_old_id"
    `);

    // ---------- Step 5: update all child tables ----------
    for (const table of this.TABLES_WITH_PLAYER_FK) {
      const hasTable = await queryRunner.hasTable(table);
      if (!hasTable) continue;

      // Get current player_id column type
      const colInfo = await queryRunner.query(`
        SELECT data_type FROM information_schema.columns
        WHERE table_name = $1 AND column_name = 'player_id'
      `, [table]);

      if (colInfo.length === 0) continue; // no player_id column

      // Create temp mapping table for this table
      await queryRunner.query(`
        CREATE TEMP TABLE IF NOT EXISTS "_player_id_map" AS
        SELECT "id"::text as old_id, ("id")::text as new_id FROM "player"
      `);

      // Update each child table using the mapping
      if (colInfo[0].data_type === 'uuid') {
        await queryRunner.query(`
          ALTER TABLE "${table}" ADD COLUMN "player_id_new" int
        `);

        await queryRunner.query(`
          UPDATE "${table}" SET "player_id_new" = (
            SELECT "id"::int FROM "player" WHERE "id"::text = "${table}"."player_id"::text
          )
        `);

        // Drop old FK
        const fkConstraints = await queryRunner.query(`
          SELECT conname FROM pg_constraint
          WHERE conrelid = '"${table}"'::regclass
          AND confrelid = '"player"'::regclass
          AND contype = 'f'
        `);
        for (const row of fkConstraints) {
          await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${row.conname}"`);
        }

        await queryRunner.query(`
          ALTER TABLE "${table}" DROP COLUMN "player_id"
        `);
        await queryRunner.query(`
          ALTER TABLE "${table}" RENAME COLUMN "player_id_new" TO "player_id"
        `);

        // Re-add FK
        await queryRunner.query(`
          ALTER TABLE "${table}"
          ADD CONSTRAINT "FK_${table}_player_id"
          FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE
        `);
      }

      // Also handle match_event.related_player_id
      if (table === 'match_event') {
        const relColInfo = await queryRunner.query(`
          SELECT data_type FROM information_schema.columns
          WHERE table_name = 'match_event' AND column_name = 'related_player_id'
        `);
        if (relColInfo.length > 0 && relColInfo[0].data_type === 'uuid') {
          await queryRunner.query(`
            ALTER TABLE "match_event" ADD COLUMN "related_player_id_new" int
          `);

          await queryRunner.query(`
            UPDATE "match_event" SET "related_player_id_new" = (
              SELECT "id"::int FROM "player" WHERE "id"::text = "match_event"."related_player_id"::text
            )
          `);

          await queryRunner.query(`
            ALTER TABLE "match_event" DROP COLUMN "related_player_id"
          `);
          await queryRunner.query(`
            ALTER TABLE "match_event" RENAME COLUMN "related_player_id_new" TO "related_player_id"
          `);
        }
      }

      // Also handle archived_player_event.player_id
      if (table === 'archived_player_event') {
        const archivedRelCol = await queryRunner.query(`
          SELECT data_type FROM information_schema.columns
          WHERE table_name = 'archived_player_event' AND column_name = 'related_player_id'
        `);
        if (archivedRelCol.length > 0 && archivedRelCol[0].data_type === 'uuid') {
          await queryRunner.query(`
            ALTER TABLE "archived_player_event" ADD COLUMN "related_player_id_new" int
          `);
          await queryRunner.query(`
            UPDATE "archived_player_event" SET "related_player_id_new" = (
              SELECT "id"::int FROM "player" WHERE "id"::text = "archived_player_event"."related_player_id"::text
            )
          `);
          await queryRunner.query(`
            ALTER TABLE "archived_player_event" DROP COLUMN "related_player_id"
          `);
          await queryRunner.query(`
            ALTER TABLE "archived_player_event" RENAME COLUMN "related_player_id_new" TO "related_player_id"
          `);
        }
      }
    }

    // ---------- Step 6: player.team_id — INTENTIONALLY SKIPPED ----------
    // The original migration tried to convert player.team_id from uuid to int
    // and use `team.id::int` to map values. But team.id is still uuid (TeamEntity
    // is unchanged), so:
    //   1. `team.id::int` throws `cannot cast type uuid to integer`.
    //   2. Even if the cast worked, the resulting int FK would not match
    //      team.id's actual type, breaking referential integrity.
    // The correct change is to also convert TeamEntity.id to int, which is out
    // of scope for this player-focused migration. Until that lands,
    // player.team_id stays uuid and points to team.id (uuid) as before.

    // ---------- Step 7: player.youth_league_id — INTENTIONALLY SKIPPED ----------
    // Same reasoning as Step 6: youth_league.id is still uuid, so
    // player.youth_league_id must remain uuid.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore display_id column (will be empty — UUIDs cannot be reconstructed)
    await queryRunner.query(`
      ALTER TABLE "player" ADD COLUMN "display_id" bigint
    `);

    // Add back old uuid id column
    await queryRunner.query(`
      ALTER TABLE "player" ADD COLUMN "id_old" uuid NOT NULL DEFAULT uuid_generate_v4()
    `);

    // Update all child tables to use new player id for reference
    for (const table of this.TABLES_WITH_PLAYER_FK) {
      const hasTable = await queryRunner.hasTable(table);
      if (!hasTable) continue;

      await queryRunner.query(`
        ALTER TABLE "${table}" ADD COLUMN "player_id_old" uuid
      `);
      await queryRunner.query(`
        UPDATE "${table}" SET "player_id_old" = (
          SELECT "id_old"::uuid FROM "player" WHERE "id" = "${table}"."player_id"
        )
      `);

      // Drop FK
      const fkConstraints = await queryRunner.query(`
        SELECT conname FROM pg_constraint
        WHERE conrelid = '"${table}"'::regclass
        AND confrelid = '"player"'::regclass
        AND contype = 'f'
      `);
      for (const row of fkConstraints) {
        await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${row.conname}"`);
      }

      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "player_id"`);
      await queryRunner.query(`ALTER TABLE "${table}" RENAME COLUMN "player_id_old" TO "player_id"`);

      await queryRunner.query(`
        ALTER TABLE "${table}"
        ADD CONSTRAINT "FK_${table}_player_id"
        FOREIGN KEY ("player_id") REFERENCES "player"("id_old") ON DELETE CASCADE
      `);

      // match_event.related_player_id
      if (table === 'match_event') {
        await queryRunner.query(`
          ALTER TABLE "match_event" ADD COLUMN "related_player_id_old" uuid
        `);
        await queryRunner.query(`
          UPDATE "match_event" SET "related_player_id_old" = (
            SELECT "id_old"::uuid FROM "player" WHERE "id" = "match_event"."related_player_id"
          )
        `);
        await queryRunner.query(`ALTER TABLE "match_event" DROP COLUMN "related_player_id"`);
        await queryRunner.query(`ALTER TABLE "match_event" RENAME COLUMN "related_player_id_old" TO "related_player_id"`);
      }

      if (table === 'archived_player_event') {
        await queryRunner.query(`
          ALTER TABLE "archived_player_event" ADD COLUMN "related_player_id_old" uuid
        `);
        await queryRunner.query(`
          UPDATE "archived_player_event" SET "related_player_id_old" = (
            SELECT "id_old"::uuid FROM "player" WHERE "id" = "archived_player_event"."related_player_id"
          )
        `);
        await queryRunner.query(`ALTER TABLE "archived_player_event" DROP COLUMN "related_player_id"`);
        await queryRunner.query(`ALTER TABLE "archived_player_event" RENAME COLUMN "related_player_id_old" TO "related_player_id"`);
      }
    }

    // Restore player table
    await queryRunner.query(`ALTER TABLE "player" DROP CONSTRAINT "PK_player_id"`);
    await queryRunner.query(`ALTER TABLE "player" DROP COLUMN "id"`);
    await queryRunner.query(`ALTER TABLE "player" RENAME COLUMN "id_old" TO "id"`);
    await queryRunner.query(`
      ALTER TABLE "player" ADD CONSTRAINT "PK_player_id" PRIMARY KEY ("id")
    `);

    // team_id back
    await queryRunner.query(`ALTER TABLE "player" ADD COLUMN "team_id_old" uuid`);
    await queryRunner.query(`
      UPDATE "player" SET "team_id_old" = (
        SELECT "id"::uuid FROM "team" WHERE "id"::int = "player"."team_id"
      )
    `);
    await queryRunner.query(`ALTER TABLE "player" DROP COLUMN "team_id"`);
    await queryRunner.query(`ALTER TABLE "player" RENAME COLUMN "team_id_old" TO "team_id"`);

    // youth_league_id back
    await queryRunner.query(`ALTER TABLE "player" ADD COLUMN "youth_league_id_old" uuid`);
    await queryRunner.query(`
      UPDATE "player" SET "youth_league_id_old" = (
        SELECT "id"::uuid FROM "youth_league" WHERE "id"::int = "player"."youth_league_id"
      )
    `);
    await queryRunner.query(`ALTER TABLE "player" DROP COLUMN "youth_league_id"`);
    await queryRunner.query(`ALTER TABLE "player" RENAME COLUMN "youth_league_id_old" TO "youth_league_id"`);
  }
}
