import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlayerTable1732688000000 implements MigrationInterface {
    name = 'CreatePlayerTable1732688000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      CREATE TABLE "player" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "birthday" date,
        "avatar" character varying NOT NULL DEFAULT '',
        "position" character varying,
        "is_goalkeeper" boolean NOT NULL DEFAULT false,
        "on_transfer" boolean NOT NULL DEFAULT false,
        "attributes" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_player_id" PRIMARY KEY ("id")
      )
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "player"`);
    }
}
