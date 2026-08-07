import { UserOnboardingStatus } from '@goalxi/database';
import { Expose, Type } from 'class-transformer';

/**
 * Subset of `TeamResDto` exposed to the onboarding endpoint.
 *
 * We deliberately do NOT reuse `TeamResDto` here — that DTO
 * includes presentation fields like `jerseyColor*` and `benchConfig`
 * which the onboarding screen doesn't need. The narrower shape
 * also keeps the `state` payload stable if `TeamResDto` evolves
 * (e.g. we add `foundedYear` later, the onboarding screen should
 * not have to revisit its render code).
 */
export class OnboardingTeamSummaryDto {
  @Expose()
  id!: string;

  @Expose()
  name!: string;

  @Expose()
  shortCode!: string;

  @Expose()
  leagueId!: string | null;

  @Expose()
  isBot!: boolean;

  @Expose()
  eloRating!: number;

  @Expose()
  botLevel!: number;
}

/**
 * Response shape for `GET /onboarding/state`.
 *
 * `status` mirrors `UserEntity.onboardingStatus`; `hasTeam` is a
 * derived boolean that's `true` exactly when the lookup found a
 * non-BOT team row. The two are technically redundant today
 * (status=ACTIVE ⇒ hasTeam=true by construction), but the
 * `getOnboardingState` service can downgrade an inconsistent row
 * (status=ACTIVE but no team) to `hasTeam=false` and we want the
 * frontend to see both pieces so it can render a sensible
 * message.
 *
 * `needsName` is the rename-step gate: it is `true` only when
 * `hasTeam=true` AND the team's `name` still matches the
 * `ONBOARDING_PENDING_NAME` sentinel written by
 * `OnboardingAssigner.claim` immediately after picking a BOT.
 * The `/onboarding/select` page uses this flag to decide
 * whether to render the "name your club" form or route the
 * returning manager straight to `/dashboard`. Deriving the
 * flag server-side (rather than sending the sentinel and
 * letting the frontend compare) means the frontend never has
 * to know the sentinel value, and the contract stays stable
 * even if the sentinel format changes.
 */
export class OnboardingStateResDto {
  @Expose()
  status!: UserOnboardingStatus;

  @Expose()
  hasTeam!: boolean;

  @Expose()
  @Type(() => OnboardingTeamSummaryDto)
  team!: OnboardingTeamSummaryDto | null;

  @Expose()
  needsName!: boolean;
}
