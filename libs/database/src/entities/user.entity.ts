import { Uuid } from '../types/common.type';
import { AbstractEntity } from './abstract.entity';
import { hashPassword as hashPass } from '../utils/password.util';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SessionEntity } from './session.entity';

/**
 * RBAC role. Single source of truth shared by `UserEntity.role`,
 * `JwtPayloadType.role`, and `RolesGuard`. Extend this enum when
 * adding a new privileged tier (e.g. `MODERATOR` for forum mods).
 */
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

/**
 * Onboarding state machine for the "register → claim a BOT team"
 * flow. The actual claim work runs in the `settlement` microservice
 * via a BullMQ job (`onboarding-assignment` / `assign-team`),
 * produced by `AuthService.register` and consumed by
 * `OnboardingProcessor` in `settlement/src/processors/`.
 *
 * Lifecycle:
 *
 *   register succeeds
 *        │
 *        ▼
 *   TEAMLESS ──(api emits BullMQ job)──▶ PROCESSING
 *                                            │
 *                                  (worker assigns a BOT)
 *                                            │
 *                                            ▼
 *                                          ACTIVE
 *                                            │
 *                            (admin reset / team hard-deleted)
 *                                            ▼
 *                                         TEAMLESS  (cycle)
 *
 * Why an explicit PROCESSING state and not just "stay in TEAMLESS
 * until ACTIVE":
 *   - The frontend `AuthContext` polls `/onboarding/state` on every
 *     navigation; it needs a distinct "work in flight" signal so it
 *     can render the loading screen instead of either (a) falsely
 *     telling the user "no team yet, claim one" or (b) skipping the
 *     onboarding screen entirely.
 *   - BullMQ retries with `attempts: 3`. PROCESSING is the natural
 *     observability handle — if a user is stuck in PROCESSING for
 *     more than a few seconds, the worker is broken.
 *
 * `TEAMLESS` covers both "just registered, job not yet picked up"
 * and "claimed once but lost the team for some reason" — the
 * assigner is idempotent and will re-claim a fresh BOT if the user
 * requests it again.
 */
export enum UserOnboardingStatus {
  TEAMLESS = 'teamless',
  PROCESSING = 'processing',
  ACTIVE = 'active',
}

@Entity('user')
export class UserEntity extends AbstractEntity {
  constructor(data?: Partial<UserEntity>) {
    super();
    Object.assign(this, data);
  }

  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_user_id' })
  id!: Uuid;

  @Column({
    length: 50,
    nullable: true,
  })
  @Index('UQ_user_username', {
    where: '"deleted_at" IS NULL',
    unique: true,
  })
  username: string;

  @Column()
  @Index('UQ_user_email', { where: '"deleted_at" IS NULL', unique: true })
  email!: string;

  @Column()
  password!: string;

  @Column({ default: '' })
  bio?: string;

  // Football Manager specific fields
  @Column({ name: 'nickname', length: 50, nullable: true })
  nickname?: string;

  @Column({ name: 'avatar', default: '' })
  avatar?: string;

  @Column({ name: 'supporter_level', type: 'int', default: 0 })
  supporterLevel: number; // 0 = no, 1 = tier1, 2 = tier2, 3 = tier3

  /**
   * RBAC role used by `RolesGuard` to gate administrative endpoints
   * (e.g. match CRUD). Default `user`; flip a row to `admin` via SQL
   * or `PATCH /auth/users/:id/role` once that endpoint is added.
   */
  @Column({
    name: 'role',
    type: 'varchar',
    length: 20,
    default: 'user',
  })
  role: UserRole;

  /**
   * Onboarding lifecycle state. Defaults to `TEAMLESS` for every
   * freshly-registered user; flipped to `ACTIVE` once
   * `OnboardingService.assignTeamToUser` successfully claims a BOT
   * team for them.
   *
   * `TEAMLESS` is also the fallback if a user logs in but the
   * `team` lookup returns null (orphan, race, manual SQL fix) — the
   * auth/AuthContext should redirect them to `/onboarding/select`
   * instead of the dashboard.
   */
  @Column({
    name: 'onboarding_status',
    type: 'varchar',
    length: 20,
    default: UserOnboardingStatus.TEAMLESS,
  })
  onboardingStatus: UserOnboardingStatus;

  /**
   * Locale the user registered from. Captured at the register
   * page from `params.locale` (the `en` / `zh` segment of the
   * URL) so we can route them back to the right language after
   * every subsequent login — see `AuthContext.login` and the
   * `register.page.tsx` field that ships this value. The
   * default `'en'` covers pre-migration rows and the rare
   * case where a script-driven register omits the field;
   * `'en'` is also next-intl's `defaultLocale` so the two
   * never disagree.
   *
   * `varchar(8)` is sized for the locale codes we support
   * today (`en`, `zh`); bump the column in a follow-up
   * migration if a longer code (e.g. `pt-BR`) lands.
   */
  @Column({
    name: 'preferred_language',
    type: 'varchar',
    length: 8,
    default: 'en',
  })
  preferredLanguage: string;

  /**
   * IANA timezone string (e.g. `'Asia/Shanghai'`, `'America/New_York'`).
   * Used by the web client to format dates via
   * `Intl.DateTimeFormat({ timeZone })` — see
   * `web/src/lib/format-datetime.ts`. Server-side rendering is
   * NOT affected: scheduled matches, email templates, and cron
   * jobs all stay in UTC. See migration
   * `1787000000000-AddUserTimezone` for the column shape and the
   * rationale behind the `'UTC'` default.
   */
  @Column({
    name: 'timezone',
    type: 'varchar',
    length: 64,
    default: 'UTC',
  })
  timezone: string;

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamptz',
    default: null,
  })
  deletedAt: Date;

  @OneToMany(() => SessionEntity, (session) => session.user)
  sessions?: SessionEntity[];

  /**
   * Hash the plaintext password before persisting.
   *
   * Only fires on `@BeforeInsert`. There is intentionally NO
   * `@BeforeUpdate` hook: a previously loaded argon2 hash sitting
   * in `this.password` would be re-hashed on every UPDATE,
   * producing `argon2(argon2(plain))` and silently locking the
   * user out on the next login. That was the bug
   * (regression: `PATCH /users/me` for a language flip, a
   * timezone change, a bio update, or an admin `updateUser`
   * call all triggered it).
   *
   * Callers that want to rotate the password on an existing row
   * (`UserService.changePassword`,
   * `AuthService.resetPassword`) must hash the plaintext
   * themselves via `@/utils/password.util` *before* assigning
   * and saving — see the comments at those call sites.
   */
  @BeforeInsert()
  async hashPassword() {
    if (this.password) {
      this.password = await hashPass(this.password);
    }
  }
}
