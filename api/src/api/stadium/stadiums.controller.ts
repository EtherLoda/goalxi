import { Uuid } from '@/common/types/common.type';
import { Public } from '@/decorators/public.decorator';
import { Controller, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StadiumService } from './stadium.service';

/**
 * §5 Stadium — read-only access addressed by the stadium itself.
 *
 * `StadiumController` (`/teams/:teamId/stadium`) asks "which ground does this
 * club play at"; this one asks "what is this ground", which is the question a
 * match card or a club profile is actually holding: the venue id, not the id
 * of whichever club happens to be at home today (a neutral-venue cup final is
 * played at a third club's ground).
 *
 * Read-only by design. Every write stays on the team-scoped controller where
 * `assertTeamOwner` can check ownership against the club that owns the ground.
 */
@ApiTags('Stadium')
@Controller({
  path: 'stadiums/:stadiumId',
  version: '1',
})
export class StadiumsController {
  constructor(private readonly stadiumService: StadiumService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async getStadiumSummary(@Param('stadiumId') stadiumId: Uuid) {
    return this.stadiumService.getSummaryByStadiumId(stadiumId);
  }
}
