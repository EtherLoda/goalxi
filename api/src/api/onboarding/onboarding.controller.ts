import { CurrentUser } from '@/decorators/current-user.decorator';
import { ApiAuth } from '@/decorators/http.decorators';
import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { OnboardingStateResDto } from './dto/onboarding-state.res.dto';
import { OnboardingService } from './onboarding.service';

/**
 * Onboarding endpoints.
 *
 * The actual claim work runs asynchronously — `AuthService.register`
 * enqueues a job, and `OnboardingProcessor` (in `settlement`)
 * consumes it. This controller exposes:
 *
 *   - `GET /onboarding/state`  — the polling endpoint the
 *     frontend hits on every navigation to decide between
 *     `/dashboard` and `/onboarding/select`.
 *   - `POST /onboarding/claim`  — manual retry / "kick the
 *     worker" button. Useful when a user sits in PROCESSING
 *     for too long (e.g. settlement was down during register)
 *     and needs to re-enqueue without logging out and back in.
 */
@ApiTags('Onboarding')
@ApiBearerAuth()
@Controller({
  path: 'onboarding',
  version: '1',
})
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @ApiAuth({
    summary: 'Get the current onboarding state for the logged-in user',
  })
  @Get('state')
  @HttpCode(HttpStatus.OK)
  async getState(
    @CurrentUser() user: JwtPayloadType,
  ): Promise<OnboardingStateResDto> {
    return this.onboardingService.getOnboardingState(user.id);
  }

  @ApiAuth({
    summary: 'Manually re-trigger the team-claim worker for the current user',
  })
  @Post('claim')
  @HttpCode(HttpStatus.ACCEPTED)
  async claim(
    @CurrentUser() user: JwtPayloadType,
  ): Promise<{ enqueued: true }> {
    await this.onboardingService.enqueueAssignTeam(user.id);
    return { enqueued: true };
  }
}
