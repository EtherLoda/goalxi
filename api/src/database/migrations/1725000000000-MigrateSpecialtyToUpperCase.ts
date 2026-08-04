import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migrate player.specialty from snake_case identifiers (e.g. `header_specialist`)
 * to the canonical UPPER_SNAKE_CASE codes that match the frontend's
 * SpecialtyCode enum (HEADER, LPASS, …) and the @goalxi/database PlayerAbility
 * type.
 *
 * The previous naming scheme (set up in 1700000000005-AddSpecialtyToPlayer) was
 * only ever read by the simulator engine; the frontend's SpecialtyIcon never
 * recognised it, so newly generated players rendered as fallback dots. After
 * this migration the DB value and the SVG file stem share the same identifier
 * and the icon path resolves directly.
 *
 * If the value ever diverges again, revert with:
 *   UPDATE player SET specialty = CASE specialty … END;
 * (see `down` below for the reverse mapping).
 */
export class MigrateSpecialtyToUpperCase1725000000000
  implements MigrationInterface
{
  name = 'MigrateSpecialtyToUpperCase1725000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "player" SET "specialty" = 'HEADER' WHERE "specialty" = 'header_specialist';
      UPDATE "player" SET "specialty" = 'LPASS'  WHERE "specialty" = 'long_passer';
      UPDATE "player" SET "specialty" = 'CROSS'  WHERE "specialty" = 'cross_specialist';
      UPDATE "player" SET "specialty" = 'DRBLE'  WHERE "specialty" = 'dribble_master';
      UPDATE "player" SET "specialty" = 'LSHT'   WHERE "specialty" = 'long_shooter';
      UPDATE "player" SET "specialty" = 'CLUCH'  WHERE "specialty" = 'clutch_player';
      UPDATE "player" SET "specialty" = 'TACKL'  WHERE "specialty" = 'tackle_master';
      UPDATE "player" SET "specialty" = 'PSAVE'  WHERE "specialty" = 'penalty_saver';
      UPDATE "player" SET "specialty" = 'CNTR'   WHERE "specialty" = 'counter_starter';
      UPDATE "player" SET "specialty" = 'REBND'  WHERE "specialty" = 'rebound_specialist';
      UPDATE "player" SET "specialty" = 'FSTRT'  WHERE "specialty" = 'fast_start';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "player" SET "specialty" = 'header_specialist' WHERE "specialty" = 'HEADER';
      UPDATE "player" SET "specialty" = 'long_passer'      WHERE "specialty" = 'LPASS';
      UPDATE "player" SET "specialty" = 'cross_specialist'  WHERE "specialty" = 'CROSS';
      UPDATE "player" SET "specialty" = 'dribble_master'    WHERE "specialty" = 'DRBLE';
      UPDATE "player" SET "specialty" = 'long_shooter'      WHERE "specialty" = 'LSHT';
      UPDATE "player" SET "specialty" = 'clutch_player'     WHERE "specialty" = 'CLUCH';
      UPDATE "player" SET "specialty" = 'tackle_master'     WHERE "specialty" = 'TACKL';
      UPDATE "player" SET "specialty" = 'penalty_saver'     WHERE "specialty" = 'PSAVE';
      UPDATE "player" SET "specialty" = 'counter_starter'   WHERE "specialty" = 'CNTR';
      UPDATE "player" SET "specialty" = 'rebound_specialist' WHERE "specialty" = 'REBND';
      UPDATE "player" SET "specialty" = 'fast_start'        WHERE "specialty" = 'FSTRT';
    `);
  }
}
