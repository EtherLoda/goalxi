import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMatchAutomationColumns1764838776791 implements MigrationInterface {
    name = 'AddMatchAutomationColumns1764838776791'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "match" ADD "tactics_locked" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "match" ADD "home_forfeit" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "match" ADD "away_forfeit" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "match" ADD "first_half_injury_time" integer`);
        await queryRunner.query(`ALTER TABLE "match" ADD "second_half_injury_time" integer`);
        await queryRunner.query(`ALTER TABLE "match" ADD "has_extra_time" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "match" ADD "extra_time_first_half_injury" integer`);
        await queryRunner.query(`ALTER TABLE "match" ADD "extra_time_second_half_injury" integer`);
        await queryRunner.query(`ALTER TABLE "match" ADD "has_penalty_shootout" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "match" DROP COLUMN "has_penalty_shootout"`);
        await queryRunner.query(`ALTER TABLE "match" DROP COLUMN "extra_time_second_half_injury"`);
        await queryRunner.query(`ALTER TABLE "match" DROP COLUMN "extra_time_first_half_injury"`);
        await queryRunner.query(`ALTER TABLE "match" DROP COLUMN "has_extra_time"`);
        await queryRunner.query(`ALTER TABLE "match" DROP COLUMN "second_half_injury_time"`);
        await queryRunner.query(`ALTER TABLE "match" DROP COLUMN "first_half_injury_time"`);
        await queryRunner.query(`ALTER TABLE "match" DROP COLUMN "away_forfeit"`);
        await queryRunner.query(`ALTER TABLE "match" DROP COLUMN "home_forfeit"`);
        await queryRunner.query(`ALTER TABLE "match" DROP COLUMN "tactics_locked"`);
    }

}
