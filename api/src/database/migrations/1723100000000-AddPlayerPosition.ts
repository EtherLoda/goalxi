import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `player.position` (formation slot, e.g. "CB", "ST", "GK").
 *
 * Nullable: senior players don't carry a formation position here
 * (formation assignment lives in tactics state). Youth players get
 * their position populated by `ScoutsService.selectCandidate` so the
 * squad UI can show "where they play" before they're promoted.
 */
export class AddPlayerPosition1723100000000 implements MigrationInterface {
  name = 'AddPlayerPosition1723100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "player"
        ADD COLUMN IF NOT EXISTS "position" varchar(8) NULL
    `);
    // No backfill needed: existing rows default to NULL.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "player" DROP COLUMN IF EXISTS "position"
    `);
  }
}
