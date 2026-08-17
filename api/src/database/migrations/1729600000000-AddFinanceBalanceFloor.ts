import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * §5 Finance — debt floor
 *
 * Adds a CHECK constraint on `finance.balance` so a team can
 * carry debt (negative balance) down to but not past -1,000,000.
 * A team deeper than that is a bug, not a gameplay state — the
 * application layer (`FinanceService.processTransaction` /
 * `processWeeklySettlementAtomic`) treats any write that would
 * drop the balance below the floor as a rejected transaction
 * and surfaces a 4xx to the caller. The DB-level CHECK is the
 * backstop in case an application path forgets the pre-check
 * (e.g. a new code path that adds a raw `UPDATE finance
 * SET balance = balance - X`).
 *
 * -1,000,000 is the agreed design cap. The new-manager
 * "starting balance = 500k + starting fans = 10k" baseline
 * bottoms at ~470k by W5 and trends positive; debt only
 * accrues if the manager over-extends (e.g. signs an
 * overpriced player). A -1M floor gives roughly 5 weeks of
 * grace at full burn before the constraint trips.
 *
 * The constraint is named `finance_balance_floor` so a
 * down-migration can `DROP CONSTRAINT IF EXISTS
 * finance_balance_floor` without scanning the
 * information_schema for the auto-generated name.
 */
export class AddFinanceBalanceFloor1729600000000 implements MigrationInterface {
  name = 'AddFinanceBalanceFloor1729600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "finance"
            ADD CONSTRAINT "finance_balance_floor" CHECK ("balance" >= -1000000)
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "finance"
            DROP CONSTRAINT IF EXISTS "finance_balance_floor"
        `);
  }
}
