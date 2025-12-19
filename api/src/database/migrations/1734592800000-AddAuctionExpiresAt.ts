import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuctionExpiresAt1734592800000 implements MigrationInterface {
    name = 'AddAuctionExpiresAt1734592800000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add expires_at column (NOT NULL with default)
        await queryRunner.query(`
            ALTER TABLE "auction" 
            ADD COLUMN "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
        `);

        // Copy existing ends_at values to expires_at for existing records
        await queryRunner.query(`
            UPDATE "auction" 
            SET "expires_at" = "ends_at"
            WHERE "expires_at" IS NULL OR "expires_at" = NOW() + INTERVAL '24 hours'
        `);

        // Make ends_at nullable (it will be set only when auction closes)
        await queryRunner.query(`
            ALTER TABLE "auction" 
            ALTER COLUMN "ends_at" DROP NOT NULL
        `);

        // For active auctions, clear ends_at (it should only be set when closed)
        await queryRunner.query(`
            UPDATE "auction" 
            SET "ends_at" = NULL
            WHERE "status" = 'ACTIVE'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Restore ends_at for active auctions
        await queryRunner.query(`
            UPDATE "auction" 
            SET "ends_at" = "expires_at"
            WHERE "ends_at" IS NULL
        `);

        // Make ends_at NOT NULL again
        await queryRunner.query(`
            ALTER TABLE "auction" 
            ALTER COLUMN "ends_at" SET NOT NULL
        `);

        // Drop expires_at column
        await queryRunner.query(`
            ALTER TABLE "auction" 
            DROP COLUMN "expires_at"
        `);
    }
}
