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
 * The earlier "needs name" flag is gone: the user provides the
 * club name in the register form and the settlement worker
 * stamps it directly onto the new team — no separate rename
 * step is needed (and the `/onboarding/select` page simply
 * routes the user to `/dashboard` once `hasTeam` is true).
 */
export class OnboardingStateResDto {
  @Expose()
  status!: UserOnboardingStatus;

  @Expose()
  hasTeam!: boolean;

  @Expose()
  @Type(() => OnboardingTeamSummaryDto)
  team!: OnboardingTeamSummaryDto | null;
}
