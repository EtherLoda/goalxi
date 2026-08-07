import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `claimed_at` (timestamptz, nullable) to `transfer_transaction`.
 *
 * Background: `TransferProcessor` in settlement used to throw
 * "already being processed" the moment it saw a transaction in
 * `PROCESSING` state (see audit log #H2). That made the auction
 * settlement flow unable to recover from a crashed mid-settlement
 * worker — the next worker would always trip the same guard and
 * the auction would stay stuck in `SETTLING` until a human
 * intervened.
 *
 * The fix: a worker that sees `PROCESSING` now checks
 * `claimed_at`. If it's `NULL` (legacy data, never stamped) or
 * older than the stale-window threshold (10 minutes in the
 * worker — comfortably above the 5-minute Redis settlement lock
 * TTL), the worker treats the row as abandoned and takes over by
 * re-claiming it. Otherwise it throws, same as before.
 *
 * Nullable, no default. Existing rows are treated as
 * "never claimed" (NULL), which the worker treats as stale and
 * takes over — same as the recovery semantics, no production
 * intervention needed.
 */
export class AddTransferTransactionClaimedAt1728100000000 implements MigrationInterface {
  name = 'AddTransferTransactionClaimedAt1728100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transfer_transaction"
      ADD COLUMN IF NOT EXISTS "claimed_at" timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transfer_transaction" DROP COLUMN IF EXISTS "claimed_at"
    `);
  }
}
