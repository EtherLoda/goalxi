import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchEntity, MatchStatus, MatchType } from '@goalxi/database';
import {
  PromotionRelegationService,
  PlayoffMatch,
} from './promotion-relegation.service';

export interface PlayoffFixture {
  matchId: string;
  upperTeamId: string;
  upperTeamName: string;
  lowerTeamId: string;
  lowerTeamName: string;
  scheduledAt: Date;
  venue: 'upper';
  upperLeagueId: string;
  lowerLeagueId: string;
}

@Injectable()
export class PlayoffService {
  private readonly logger = new Logger(PlayoffService.name);

  private readonly PLAYOFF_HOUR = 20;
  private readonly PLAYOFF_MINUTE = 0;

  constructor(
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    private readonly promotionService: PromotionRelegationService,
  ) {}

  async generatePlayoffFixtures(
    playoffMatches: PlayoffMatch[],
    season: number,
  ): Promise<PlayoffFixture[]> {
    const fixtures: PlayoffFixture[] = [];
    const playoffDate = this.getNextPlayoffDate();

    for (let i = 0; i < playoffMatches.length; i++) {
      const pm = playoffMatches[i];

      const fixture: PlayoffFixture = {
        matchId: '',
        upperTeamId: pm.upperTeam.id,
        upperTeamName: pm.upperTeam.name,
        lowerTeamId: pm.lowerTeam.id,
        lowerTeamName: pm.lowerTeam.name,
        scheduledAt: playoffDate,
        venue: 'upper',
        upperLeagueId: pm.upperLeague.id,
        lowerLeagueId: pm.lowerLeague.id,
      };

      const match = this.matchRepository.create({
        homeTeamId: pm.upperTeam.id,
        awayTeamId: pm.lowerTeam.id,
        leagueId: pm.upperLeague.id,
        season,
        week: 16,
        scheduledAt: playoffDate,
        status: MatchStatus.SCHEDULED,
        type: MatchType.PLAYOFF,
        tacticsLocked: false,
        homeForfeit: false,
        awayForfeit: false,
      });

      const saved = await this.matchRepository.save(match);
      fixture.matchId = saved.id;

      fixtures.push(fixture);
      this.logger.log(
        `Created playoff fixture: ${pm.upperTeam.name} vs ${pm.lowerTeam.name} on ${playoffDate.toISOString()}`,
      );
    }

    return fixtures;
  }

  private getNextPlayoffDate(): Date {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
    const nextSaturday = new Date(now);
    nextSaturday.setDate(now.getDate() + daysUntilSaturday);
    nextSaturday.setHours(this.PLAYOFF_HOUR, this.PLAYOFF_MINUTE, 0, 0);
    return nextSaturday;
  }
}
