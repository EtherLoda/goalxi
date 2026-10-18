import { AuthGuard } from '@/guards/auth.guard';
import { TACTIC_REQUIREMENTS, TEAM_TACTIC_CODES } from '@goalxi/database';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TeamTacticsResDto } from './dto/team-tactics.res.dto';
import { GameStateService } from './game-state.service';

@Controller({
  path: 'game',
  version: '1',
})
@ApiTags('Game')
@ApiBearerAuth()
@UseGuards(AuthGuard)
export class GameController {
  constructor(private readonly gameStateService: GameStateService) {}

  @Get('current')
  @ApiOperation({
    summary: 'Get the current season, week, and the season shape (week counts)',
  })
  async getCurrentGameState() {
    // `seasonLengthWeeks` / `regularSeasonWeeks` are included so the
    // frontend can render "week N of M" without hardcoding M. They were
    // `16` in two components, which is how the header read "MW16/16"
    // forever once the season was compressed to 11 weeks.
    return this.gameStateService.getCurrentSeasonWeek();
  }

  @Get('team-tactics')
  @ApiOperation({
    summary: 'List the five team tactics and the slots each one requires',
  })
  getTeamTactics(): TeamTacticsResDto {
    // Served from `@goalxi/database` rather than duplicated in the frontend:
    // the requirement table is what the submit endpoint validates against,
    // so a client that re-declares it will drift from the gate as soon as a
    // requirement changes. The picker reads this and greys out a tactic when
    // the current lineup cannot satisfy it.
    //
    // Deliberately structural only — no display names, no descriptions, no
    // effect numbers. Copy belongs to the web i18n bundles, and the effect
    // table is engine internals that must never reach a player.
    return {
      tactics: TEAM_TACTIC_CODES.map((code) => ({
        code,
        requirements: TACTIC_REQUIREMENTS[code].map((requirement) => ({
          families: [...requirement.families],
          count: requirement.count,
        })),
      })),
    };
  }
}
