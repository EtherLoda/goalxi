import { randomInt } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add team.short_code (5-char human-facing identifier) and backfill existing teams.
 *
 * Strategy:
 *   1. Add column as nullable (so we can backfill before enforcing NOT NULL).
 *   2. For every existing row with NULL short_code, generate a unique code in
 *      Node and UPDATE. Done row-by-row to keep the uniqueness check trivial
 *      via `WHERE NOT EXISTS` on the same table.
 *   3. Enforce NOT NULL.
 *   4. Add a UNIQUE index.
 *
 * Alphabet: 32 chars (no 0/1/I/L/O), 32^5 ≈ 33.5M codes — collisions on a
 * few hundred rows are astronomically unlikely; we still retry once on hit.
 */

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 5;

function generateShortCode(): string {
  let out = '';
  for (let i = 0; i < LENGTH; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

async function pickUniqueCode(
  queryRunner: QueryRunner,
  excludeTeamId: string,
): Promise<string> {
  // Try a handful of times; collision probability per attempt is ~rows/33.5M,
  // so 5 attempts is more than enough for the current dataset.
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateShortCode();
    const existing = await queryRunner.query(
      `SELECT 1 FROM "team" WHERE "short_code" = $1 AND "id" <> $2 LIMIT 1`,
      [candidate, excludeTeamId],
    );
    if (existing.length === 0) {
      return candidate;
    }
  }
  throw new Error(
    'Failed to generate a unique team short code after 10 attempts',
  );
}

export class AddTeamShortCode1719100000001 implements MigrationInterface {
  name = 'AddTeamShortCode1719100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add column as nullable
    await queryRunner.query(`
            ALTER TABLE "team" ADD COLUMN "short_code" varchar(5)
        `);

    // 2. Backfill any existing rows
    const teams: Array<{ id: string }> = await queryRunner.query(
      `SELECT "id" FROM "team" WHERE "short_code" IS NULL`,
    );
    for (const row of teams) {
      const code = await pickUniqueCode(queryRunner, row.id);
      await queryRunner.query(
        `UPDATE "team" SET "short_code" = $1 WHERE "id" = $2`,
        [code, row.id],
      );
    }

    // 3. Enforce NOT NULL
    await queryRunner.query(`
            ALTER TABLE "team" ALTER COLUMN "short_code" SET NOT NULL
        `);

    // 4. UNIQUE index
    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_team_short_code" ON "team" ("short_code")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_team_short_code"`);
    await queryRunner.query(`ALTER TABLE "team" DROP COLUMN "short_code"`);
  }
}
