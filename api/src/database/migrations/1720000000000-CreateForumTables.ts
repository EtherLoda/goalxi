import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * §N Forum — Community feature.
 *
 * Adds four tables (forum_category, forum_thread, forum_post, forum_reaction)
 * backing the MVP forum. Tables use snake_case singular names, FKs inlined,
 * timestamptz timestamps, and partial unique indexes that respect soft delete.
 *
 * Seeds reference data:
 *   - System user (id 00000000-0000-0000-0000-000000000001) — author of the welcome thread
 *   - 4 categories (announcements, general, tactics, transfer-market)
 *   - 1 pinned welcome thread in `announcements`
 *
 * UUIDs are deterministic so the seed can be re-run or referenced from tests.
 */
export class CreateForumTables1720000000000 implements MigrationInterface {
  name = 'CreateForumTables1720000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- Schema -------------------------------------------------------------

    await queryRunner.query(`
      CREATE TABLE "forum_category" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "slug" character varying(80) NOT NULL,
        "name" character varying(120) NOT NULL,
        "description" text,
        "scope_type" character varying(20) NOT NULL DEFAULT 'public',
        "thread_count" integer NOT NULL DEFAULT 0,
        "post_count" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_forum_category_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_forum_category_slug"
        ON "forum_category" ("slug") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_forum_category_scope" ON "forum_category" ("scope_type")`,
    );

    await queryRunner.query(`
      CREATE TABLE "forum_thread" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "category_id" uuid NOT NULL,
        "author_id" uuid NOT NULL,
        "title" character varying(200) NOT NULL,
        "body" text NOT NULL,
        "is_pinned" boolean NOT NULL DEFAULT false,
        "reply_count" integer NOT NULL DEFAULT 0,
        "last_reply_at" TIMESTAMP WITH TIME ZONE,
        "last_reply_user_id" uuid,
        "hot_score" double precision NOT NULL DEFAULT 0,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_forum_thread_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_forum_thread_category_id"
          FOREIGN KEY ("category_id") REFERENCES "forum_category"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_forum_thread_author_id"
          FOREIGN KEY ("author_id") REFERENCES "user"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_forum_thread_last_reply_user_id"
          FOREIGN KEY ("last_reply_user_id") REFERENCES "user"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_forum_thread_category_pinned"
        ON "forum_thread" ("category_id", "is_pinned", "last_reply_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_forum_thread_category_hot"
        ON "forum_thread" ("category_id", "hot_score")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_forum_thread_author" ON "forum_thread" ("author_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "forum_post" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "thread_id" uuid NOT NULL,
        "author_id" uuid NOT NULL,
        "body" text NOT NULL,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_forum_post_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_forum_post_thread_id"
          FOREIGN KEY ("thread_id") REFERENCES "forum_thread"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_forum_post_author_id"
          FOREIGN KEY ("author_id") REFERENCES "user"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_forum_post_thread_created"
        ON "forum_post" ("thread_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_forum_post_author" ON "forum_post" ("author_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "forum_reaction" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "post_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "type" character varying(16) NOT NULL DEFAULT 'like',
        CONSTRAINT "PK_forum_reaction_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_forum_reaction_post_id"
          FOREIGN KEY ("post_id") REFERENCES "forum_post"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_forum_reaction_user_id"
          FOREIGN KEY ("user_id") REFERENCES "user"("id")
          ON DELETE CASCADE,
        CONSTRAINT "UQ_forum_reaction_post_user_type"
          UNIQUE ("post_id", "user_id", "type")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_forum_reaction_post" ON "forum_reaction" ("post_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_forum_reaction_user" ON "forum_reaction" ("user_id")`,
    );

    // ---- Seed ---------------------------------------------------------------

    // System user — fixed UUID, sentinel password (never logs in), no email.
    // `username='system'` is taken via partial unique index (others can be NULL).
    await queryRunner.query(
      `INSERT INTO "user" (
         "id", "username", "email", "password", "supporter_level", "created_at", "updated_at"
       ) VALUES (
         '00000000-0000-0000-0000-000000000001',
         'system',
         'system@goalxi.local',
         '!disabled-system-account!',
         0,
         now(),
         now()
       )`,
    );

    // Categories
    await queryRunner.query(
      `INSERT INTO "forum_category" (
         "id", "slug", "name", "description", "scope_type", "created_at", "updated_at"
       ) VALUES
         ('00000000-0000-0000-0000-000000000010', 'announcements',     'Announcements',     'Official news from the GoalXI team.',  'public', now(), now()),
         ('00000000-0000-0000-0000-000000000011', 'general',           'General',           'Off-topic chat and introductions.',    'public', now(), now()),
         ('00000000-0000-0000-0000-000000000012', 'tactics',           'Tactics',           'Formations, player roles, set pieces.', 'public', now(), now()),
         ('00000000-0000-0000-0000-000000000013', 'transfer-market',   'Transfer Market',   'Buy, sell, and discuss transfers.',     'public', now(), now())
       `,
    );

    // Welcome thread (pinned, in announcements, authored by system)
    await queryRunner.query(
      `INSERT INTO "forum_thread" (
         "id", "category_id", "author_id", "title", "body", "is_pinned",
         "reply_count", "hot_score", "created_at", "updated_at"
       ) VALUES (
         '00000000-0000-0000-0000-000000000020',
         '00000000-0000-0000-0000-000000000010',
         '00000000-0000-0000-0000-000000000001',
         'Welcome to GoalXI',
         'Welcome to the GoalXI community forum!\n\nThis is a place to talk tactics, swap transfer tips, report bugs, and get to know other managers.\n\nA few quick rules:\n- Be respectful. We play a game, not a war.\n- No spam, ads, or multi-account abuse.\n- Bug reports go in the right category so the team can find them.\n\nHave fun, and may your team lift the cup.',
         true,
         0,
         100,
         now(),
         now()
       )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse order — dependents first
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_forum_reaction_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_forum_reaction_post"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "forum_reaction"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_forum_post_author"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_forum_post_thread_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "forum_post"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_forum_thread_author"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_forum_thread_category_hot"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_forum_thread_category_pinned"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "forum_thread"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_forum_category_scope"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_forum_category_slug"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "forum_category"`);

    // Remove the seed user
    await queryRunner.query(
      `DELETE FROM "user" WHERE "id" = '00000000-0000-0000-0000-000000000001'`,
    );
  }
}
