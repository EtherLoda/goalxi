import { createHash } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add player.display_id (Hattrick-style 11-digit numeric ID) and backfill
 * existing players.
 *
 * Strategy mirrors AddTeamShortCode:
 *   1. Add column as nullable.
 *   2. For every row, compute displayId = SHA256(id).slice(0,16) → bigint
 *      mod 10^11, linear-probing on conflict (up to 1000 attempts).
 *   3. Enforce NOT NULL.
 *   4. UNIQUE index.
 */

const HEX_PREFIX_LEN = 16;
const DISPLAY_ID_MAX = 10n ** 11n;

function displayIdFromUuid(uuid: string): bigint {
  const hex = createHash('sha256')
    .update(uuid)
    .digest('hex')
    .slice(0, HEX_PREFIX_LEN);
  return BigInt('0x' + hex) % DISPLAY_ID_MAX;
}

async function pickUniqueDisplayId(
  queryRunner: QueryRunner,
  excludePlayerId: string,
): Promise<bigint> {
  const start = displayIdFromUuid(excludePlayerId);
  for (let attempt = 0n; attempt < 1000n; attempt++) {
    const candidate = (start + attempt) % DISPLAY_ID_MAX;
    const existing = await queryRunner.query(
      `SELECT 1 FROM "player" WHERE "display_id" = $1 AND "id" <> $2 LIMIT 1`,
      [candidate.toString(), excludePlayerId],
    );
    if (existing.length === 0) {
      return candidate;
    }
  }
  throw new Error(
    'Failed to generate a unique player display ID after 1000 attempts',
  );
}

export class AddPlayerDisplayId1719100000002 implements MigrationInterface {
  name = 'AddPlayerDisplayId1719100000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add column as nullable
    await queryRunner.query(`
            ALTER TABLE "player" ADD COLUMN "display_id" bigint
        `);

    // 2. Backfill any existing rows
    const players: Array<{ id: string }> = await queryRunner.query(
      `SELECT "id" FROM "player" WHERE "display_id" IS NULL`,
    );
    for (const row of players) {
      const id = await pickUniqueDisplayId(queryRunner, row.id);
      await queryRunner.query(
        `UPDATE "player" SET "display_id" = $1 WHERE "id" = $2`,
        [id.toString(), row.id],
      );
    }

    // 3. Enforce NOT NULL
    await queryRunner.query(`
            ALTER TABLE "player" ALTER COLUMN "display_id" SET NOT NULL
        `);

    // 4. UNIQUE index
    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_player_display_id" ON "player" ("display_id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_player_display_id"`);
    await queryRunner.query(`ALTER TABLE "player" DROP COLUMN "display_id"`);
  }
}
