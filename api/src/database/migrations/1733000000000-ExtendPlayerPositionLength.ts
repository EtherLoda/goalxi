import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widen `player.position` from varchar(8) to varchar(16).
 *
 * Context. The original column was sized at 8 chars in
 * 1723100000000-AddPlayerPosition.ts. The senior 1-slot keys
 * (`ST`, `CF`, `LW`, ...) and the senior 3-slot family
 * (`CBL`, `AML`, `CMR`, ...) all fit in 8 characters. The bench
 * bucket identifiers (`BENCH_GK`, `BENCH_CB`, `BENCH_FB`,
 * `BENCH_W`, `BENCH_CM`, `BENCH_FW`) are 9 characters each — they
 * never lived on the player row, but the unification plan now
 * wants bench names to be a valid player.position value as well
 * (e.g. for future "sub formation" UIs that surface a slot name
 * directly on a player card).
 *
 * Why varchar(16) and not enum. The codebase treats position
 * as a free-form string everywhere — `ScoutsService.selectCandidate`
 * writes the scout generator's chosen slot directly, the FE
 * client emits the lineup-editor key directly, and historical
 * rows already carry the legacy 1-slot / numbered-slot aliases
 * (CD, CDL, CDR, CAML, CAMR, DMFL, ...). A PG enum would force a
 * data migration for every legacy key the project has ever
 * emitted; widening the column is a no-op on the existing data
 * and gives us room for any future 8-15 char key without a
 * schema change.
 *
 * The actual user-visible behavioural change from this migration
 * is zero: the engine still has a single normalisation path
 * (see `SLOT_KEY_NORMALIZER` in simulator), the BE validator
 * already accepts the legacy alias family, and the FE marker
 * has a `?{raw}` fallback for anything we missed. This commit
 * just removes a 1-character foot-gun on the schema.
 *
 * No data is touched. The down() restores the previous length;
 * any rows written under the new length that exceed 8 chars
 * (i.e. bench bucket names) would be truncated on the way back
 * down — same as before this commit, when the same write would
 * have failed with `value too long for type character varying(8)`.
 */
export class ExtendPlayerPositionLength1733000000000 implements MigrationInterface {
  name = 'ExtendPlayerPositionLength1733000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "player"
        ALTER COLUMN "position" TYPE varchar(16)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "player"
        ALTER COLUMN "position" TYPE varchar(8)
    `);
  }
}
