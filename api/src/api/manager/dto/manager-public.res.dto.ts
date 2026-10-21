import {
  ClassField,
  NumberField,
  StringField,
  StringFieldOptional,
} from '@/decorators/field.decorators';
import { Exclude, Expose } from 'class-transformer';

/**
 * Public projection of a user — the "manager profile" page
 * (`/managers/[id]`) reads this and nothing else.
 *
 * Why a separate DTO instead of reusing `UserResDto`: that one
 * `@Expose()`s `email`, and it also carries `timezone` and
 * `preferredLanguage`, which are the account owner's business and
 * nobody else's. This class is a WHITE LIST — a field that is not
 * declared here cannot leak, no matter what the entity gains later.
 *
 * Deliberately absent, and must stay absent:
 *
 * - `email`, `timezone`, `preferredLanguage` — private to the owner.
 * - `role`, `onboardingStatus` — internal state; publishing
 *   `onboardingStatus` would also expose who is mid-claim.
 * - The club itself. The manager page is identity only: assets,
 *   squad and league position live on `/teams/[id]`, which is where
 *   scouting is supposed to happen. Splitting them keeps a visitor
 *   list from doubling as a reconnaissance shortcut.
 */
@Exclude()
export class ManagerPublicResDto {
  @StringField()
  @Expose()
  id: string;

  /** The login handle. Shown as `@handle`; stable across nickname changes. */
  @StringField()
  @Expose()
  username: string;

  /**
   * What to print as the name: `nickname` when the user set one,
   * otherwise `username`. Resolved server-side so the web client never
   * has to know the fallback rule (and two call sites cannot disagree).
   */
  @StringField()
  @Expose()
  displayName: string;

  @StringFieldOptional()
  @Expose()
  avatar?: string | null;

  @StringFieldOptional()
  @Expose()
  bio?: string | null;

  /**
   * Paid support tier (0 = none, 1-3 = tier). Public: it is a badge on
   * the profile, the same way it shows next to the name in the forum.
   */
  @NumberField()
  @Expose()
  supporterLevel: number;

  /**
   * When the account was created. `UserEntity.createdAt` — there is no
   * separate "joined at" column, and inventing one would let the two
   * drift.
   */
  @ClassField(() => Date)
  @Expose()
  joinedAt: Date;
}
