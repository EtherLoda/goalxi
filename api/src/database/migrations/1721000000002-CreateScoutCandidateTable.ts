import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create `scout_candidate` table. The entity exists in code but the
 * `InitialSchema` migration predates the entity so the table was never
 * created — any SELECT on it returned `relation does not exist`.
 *
 * Schema mirrors `ScoutCandidateEntity`:
 *   - `player_data` (jsonb) — the entire candidate profile (see
 *     `ScoutCandidatePlayerData` for shape)
 *   - `expires_at` — 7-day TTL from generation
 *   - `team_id` — owning team (FK to `team.id`)
 *   - `created_at` / `updated_at` — from `AbstractEntity`
 */
export class CreateScoutCandidateTable1721000000002 implements MigrationInterface {
  name = 'CreateScoutCandidateTable1721000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "scout_candidate" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "team_id" uuid NOT NULL,
        "player_data" jsonb NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        CONSTRAINT "PK_scout_candidate_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_scout_candidate_team_id"
          FOREIGN KEY ("team_id") REFERENCES "team"("id")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_scout_candidate_team_expires"
        ON "scout_candidate" ("team_id", "expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_scout_candidate_team_expires"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "scout_candidate"`);
  }
}