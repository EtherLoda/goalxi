import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConsolidateAuctionMigrations1744500000001 implements MigrationInterface {
  name = 'ConsolidateAuctionMigrations1744500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add SETTLING to the auction_status_enum
    await queryRunner.query(`
      ALTER TYPE "public"."auction_status_enum" ADD VALUE IF NOT EXISTS 'SETTLING'
    `);

    // 2. Add CASCADE DELETE to transfer_transaction.auction_id FK
    await queryRunner.query(`
      ALTER TABLE "transfer_transaction"
      DROP CONSTRAINT IF EXISTS "FK_transfer_transaction_auction"
    `);
    await queryRunner.query(`
      ALTER TABLE "transfer_transaction"
      ADD CONSTRAINT "FK_transfer_transaction_auction"
      FOREIGN KEY ("auction_id") REFERENCES "auction"("id") ON DELETE CASCADE
    `);

    // 3. Add CASCADE DELETE to player_transaction.auction_id FK
    await queryRunner.query(`
      ALTER TABLE "player_transaction"
      DROP CONSTRAINT IF EXISTS "FK_45e941155f5a8b50d464f448546"
    `);
    await queryRunner.query(`
      ALTER TABLE "player_transaction"
      ADD CONSTRAINT "FK_45e941155f5a8b50d464f548546"
      FOREIGN KEY ("auction_id") REFERENCES "auction"("id") ON DELETE CASCADE
    `);

    // 4. Add CASCADE DELETE to player_history.player_id FK
    await queryRunner.query(`
      ALTER TABLE "player_history"
      DROP CONSTRAINT IF EXISTS "FK_febf6eb41877393f6a44c45b0d3"
    `);
    await queryRunner.query(`
      ALTER TABLE "player_history"
      ADD CONSTRAINT "FK_febf6eb41877393f6a44c45b0d3"
      FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL doesn't support removing enum values, so down migration is limited
  }
}
