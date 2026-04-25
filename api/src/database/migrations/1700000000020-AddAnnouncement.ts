import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAnnouncement1700000000020 implements MigrationInterface {
  name = 'AddAnnouncement1700000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "announcement_type_enum" AS ENUM (
        'GENERAL',
        'FEATURE',
        'EVENT',
        'MAINTENANCE'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "announcement" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "title" varchar(255) NOT NULL,
        "content" text NOT NULL,
        "type" "announcement_type_enum" NOT NULL DEFAULT 'GENERAL',
        "is_active" boolean NOT NULL DEFAULT true,
        "priority" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_announcement_id" PRIMARY KEY ("id")
      )
    `);

    // Insert sample announcements
    await queryRunner.query(`
      INSERT INTO "announcement" ("title", "content", "type", "priority", "is_active") VALUES
      ('Season 2 Coming Soon!', 'Get ready for Season 2! New features including enhanced tactical options and improved youth academy system.', 'FEATURE', 100, true),
      ('Transfer Window Opens', 'The winter transfer window is now open. Teams can buy and sell players until the deadline.', 'EVENT', 90, true),
      ('Server Maintenance Scheduled', 'Scheduled maintenance on April 30th from 02:00 to 04:00 UTC. Game services may be temporarily unavailable.', 'MAINTENANCE', 80, true)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "announcement"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "announcement_type_enum"`);
  }
}
