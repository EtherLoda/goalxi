import { StringField } from '@/decorators/field.decorators';
import { UserOnboardingStatus } from '@goalxi/database';
import { Expose, Type } from 'class-transformer';
import { OnboardingTeamSummaryDto } from '../../onboarding/dto/onboarding-state.res.dto';

/**
 * Response shape for `POST /auth/email/register`.
 *
 * `status` mirrors `UserEntity.onboardingStatus` and reflects
 * the user's current onboarding state at the moment the
 * register call returned. In the common case the value is
 * `teamless` — the user is created, the verification email
 * is queued, and a BullMQ job has been enqueued for the
 * settlement worker to claim a BOT team. The frontend should
 * then poll `GET /onboarding/state` to learn when the worker
 * has finished and the user has been promoted to `active`.
 *
 * `team` is always `null` in the register response because
 * the claim runs asynchronously. It exists in the DTO so
 * the type matches the post-claim `OnboardingStateResDto`
 * shape that the frontend will see on the polling endpoint
 * — keeping the two endpoints' shapes in lockstep makes the
 * frontend reducer simpler.
 */
@Expose()
export class RegisterResDto {
  @Expose()
  @StringField()
  userId!: string;

  @Expose()
  status!: UserOnboardingStatus;

  @Expose()
  @Type(() => OnboardingTeamSummaryDto)
  team!: OnboardingTeamSummaryDto | null;
}
