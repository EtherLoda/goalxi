import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorPlayerSkills1733148638000 implements MigrationInterface {
  name = 'RefactorPlayerSkills1733148638000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new columns (if not already exists in InitialSchema)
    await queryRunner.query(`
            ALTER TABLE "player"
            ADD COLUMN IF NOT EXISTS "current_skills" jsonb,
            ADD COLUMN IF NOT EXISTS "potential_skills" jsonb,
            ADD COLUMN IF NOT EXISTS "is_youth" boolean NOT NULL DEFAULT false
        `);

    // Migrate existing data from attributes to new structure (only if attributes column exists)
    await queryRunner.query(`
            DO $$
            BEGIN
              IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player' AND column_name = 'attributes') THEN
                UPDATE "player"
                SET
                    "current_skills" = COALESCE("attributes"->'current', '{"physical": {}, "technical": {}, "mental": {}}'::jsonb),
                    "potential_skills" = COALESCE("attributes"->'potential', '{"physical": {}, "technical": {}, "mental": {}}'::jsonb)
                WHERE "attributes" IS NOT NULL;
              END IF;
            END $$;
        `);

    // Set default values for rows without these columns
    await queryRunner.query(`
            UPDATE "player"
            SET
                "current_skills" = '{"physical": {}, "technical": {}, "mental": {}}'::jsonb,
                "potential_skills" = '{"physical": {}, "technical": {}, "mental": {}}'::jsonb
            WHERE "current_skills" IS NULL OR "potential_skills" IS NULL
        `);

    // Make new columns NOT NULL (ignore errors if already not null)
    await queryRunner.query(`
            ALTER TABLE "player"
            ALTER COLUMN "current_skills" SET NOT NULL,
            ALTER COLUMN "potential_skills" SET NOT NULL
        `);

    // Drop old attributes column (if exists)
    await queryRunner.query(`
            ALTER TABLE "player" DROP COLUMN IF EXISTS "attributes"
        `);

    // Drop age column (redundant, calculated from birthday)
    await queryRunner.query(`
            ALTER TABLE "player" DROP COLUMN IF EXISTS "age"
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add back attributes column
    await queryRunner.query(`
            ALTER TABLE "player" ADD COLUMN "attributes" jsonb
        `);

    // Migrate data back to old structure
    await queryRunner.query(`
            UPDATE "player" 
            SET "attributes" = jsonb_build_object(
                'current', "current_skills",
                'potential', "potential_skills"
            )
        `);

    // Drop new columns
    await queryRunner.query(`
            ALTER TABLE "player" 
            DROP COLUMN "current_skills",
            DROP COLUMN "potential_skills",
            DROP COLUMN "is_youth"
        `);

    // Add back age column
    await queryRunner.query(`
            ALTER TABLE "player" ADD COLUMN "age" integer DEFAULT 17
        `);
  }
}
