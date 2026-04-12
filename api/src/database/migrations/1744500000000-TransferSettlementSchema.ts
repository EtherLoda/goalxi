import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransferSettlementSchema1744500000000 implements MigrationInterface {
  name = 'TransferSettlementSchema1744500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add cash and lockedCash to team table
    await queryRunner.query(`
            ALTER TABLE "team"
            ADD COLUMN "cash" integer NOT NULL DEFAULT 500000
        `);
    await queryRunner.query(`
            ALTER TABLE "team"
            ADD COLUMN "locked_cash" integer NOT NULL DEFAULT 0
        `);

    // 2. Add bidLockAmount and winnerId to auction table
    await queryRunner.query(`
            ALTER TABLE "auction"
            ADD COLUMN "bid_lock_amount" integer DEFAULT 0
        `);
    await queryRunner.query(`
            ALTER TABLE "auction"
            ADD COLUMN "winner_id" uuid
        `);

    // 3. Add SETTLING status to auction status enum (if using enum)
    // Since auction.status is varchar, we don't need to alter enum

    // 4. Create transfer_transaction table
    await queryRunner.query(`
            CREATE TABLE "transfer_transaction" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "type" character varying(20) NOT NULL,
                "auction_id" uuid NOT NULL,
                "player_id" uuid NOT NULL,
                "from_team_id" uuid NOT NULL,
                "to_team_id" uuid NOT NULL,
                "amount" integer NOT NULL,
                "status" character varying(20) NOT NULL DEFAULT 'PENDING',
                "failure_reason" character varying,
                "settled_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_transfer_transaction_id" PRIMARY KEY ("id")
            )
        `);

    // 5. Add foreign keys
    await queryRunner.query(`
            ALTER TABLE "auction"
            ADD CONSTRAINT "FK_auction_winner"
            FOREIGN KEY ("winner_id") REFERENCES "team"("id")
        `);
    await queryRunner.query(`
            ALTER TABLE "transfer_transaction"
            ADD CONSTRAINT "FK_transfer_transaction_auction"
            FOREIGN KEY ("auction_id") REFERENCES "auction"("id")
        `);
    await queryRunner.query(`
            ALTER TABLE "transfer_transaction"
            ADD CONSTRAINT "FK_transfer_transaction_player"
            FOREIGN KEY ("player_id") REFERENCES "player"("id")
        `);
    await queryRunner.query(`
            ALTER TABLE "transfer_transaction"
            ADD CONSTRAINT "FK_transfer_transaction_from_team"
            FOREIGN KEY ("from_team_id") REFERENCES "team"("id")
        `);
    await queryRunner.query(`
            ALTER TABLE "transfer_transaction"
            ADD CONSTRAINT "FK_transfer_transaction_to_team"
            FOREIGN KEY ("to_team_id") REFERENCES "team"("id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    await queryRunner.query(
      `ALTER TABLE "transfer_transaction" DROP CONSTRAINT "FK_transfer_transaction_to_team"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_transaction" DROP CONSTRAINT "FK_transfer_transaction_from_team"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_transaction" DROP CONSTRAINT "FK_transfer_transaction_player"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_transaction" DROP CONSTRAINT "FK_transfer_transaction_auction"`,
    );
    await queryRunner.query(
      `ALTER TABLE "auction" DROP CONSTRAINT "FK_auction_winner"`,
    );

    // Drop transfer_transaction table
    await queryRunner.query(`DROP TABLE "transfer_transaction"`);

    // Drop columns from auction
    await queryRunner.query(`ALTER TABLE "auction" DROP COLUMN "winner_id"`);
    await queryRunner.query(
      `ALTER TABLE "auction" DROP COLUMN "bid_lock_amount"`,
    );

    // Drop columns from team
    await queryRunner.query(`ALTER TABLE "team" DROP COLUMN "locked_cash"`);
    await queryRunner.query(`ALTER TABLE "team" DROP COLUMN "cash"`);
  }
}
