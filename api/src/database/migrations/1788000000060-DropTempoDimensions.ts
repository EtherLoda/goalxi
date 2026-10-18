import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops the `tempo` column from `match_tactics` and `tactics_preset`.
 *
 * ## Why
 *
 * Tempo（比赛节奏）was never part of the product plan, and by the time it was
 * removed only two of its four engine parameters did anything:
 * `TEMPO_MODIFIERS[].duelK` scaled the push-duel curve and
 * `TEMPO_MODIFIERS[].attackTypeWeights` biased the attack mix.
 * `shotAttempts` had no reader at all, and `counterVulnerability` fed a
 * `counterBonus` that was multiplied into `effectiveAttPower` on the
 * intercept path — where `pushSuccess` is set to `true` and the only reader
 * of that variable is skipped. Keeping a column that stores a value nothing
 * reads would keep the illusion alive: every row would still say
 * 'balanced', and the UI would still be accused of hiding a working knob.
 *
 * ## Why dropping is safe
 *
 * `1700000000031` created the column with `DEFAULT 'balanced'`, and the
 * editor never exposed a tempo control, so every stored value is
 * 'balanced' — the exact configuration the engine already treats as
 * identity (all weights 1.0, `duelK` 0.5 → amplification × 1.0). Seeded
 * presets (`settlement/src/bootstrap/generators/tactics-preset.generator.ts`)
 * never set it either. Dropping therefore changes no behaviour.
 *
 * ## Down
 *
 * Re-adds the column with the original default. The per-row values are not
 * recoverable, but since they were all 'balanced' that is a no-op in
 * practice. Note the down migration does NOT restore the engine — tempo has
 * to be re-implemented in `simulator/src/engine` for the column to mean
 * anything again.
 *
 * ## Idempotency
 *
 * `DROP COLUMN IF EXISTS` / `ADD COLUMN IF NOT EXISTS` throughout.
 */
export class DropTempoDimensions1788000000060 implements MigrationInterface {
  name = 'DropTempoDimensions1788000000060';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "match_tactics" DROP COLUMN IF EXISTS "tempo"
    `);
    await queryRunner.query(`
      ALTER TABLE "tactics_preset" DROP COLUMN IF EXISTS "tempo"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tactics_preset"
      ADD COLUMN IF NOT EXISTS "tempo" varchar(10) NOT NULL DEFAULT 'balanced'
    `);
    await queryRunner.query(`
      ALTER TABLE "match_tactics"
      ADD COLUMN IF NOT EXISTS "tempo" varchar(10) NOT NULL DEFAULT 'balanced'
    `);
  }
}
