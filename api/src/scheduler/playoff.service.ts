import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchEntity, MatchStatus, MatchType } from '@goalxi/database';
import { PromotionRelegationService, PlayoffMatch } from './promotion-relegation.service';

export interface PlayoffFixture {
    matchId: string;       // 真实的 MatchEntity.id
    upperTeamId: string;
    upperTeamName: string;
    lowerTeamId: string;
    lowerTeamName: string;
    scheduledAt: Date;
    venue: 'upper';        // 主场在哪边
    upperLeagueId: string;
    lowerLeagueId: string;
}

/**
 * Playoff Service
 *
 * 升降级附加赛规则：
 * - 高级别联赛球队主场
 * - 单回合制
 * - 胜者升级，败者留在原联赛（不降级）
 */
@Injectable()
export class PlayoffService {
    private readonly logger = new Logger(PlayoffService.name);

    // 附加赛时间：联赛最后一周的周六 20:00
    private readonly PLAYOFF_HOUR = 20;
    private readonly PLAYOFF_MINUTE = 0;

    constructor(
        @InjectRepository(MatchEntity)
        private readonly matchRepository: Repository<MatchEntity>,
        private readonly promotionService: PromotionRelegationService,
    ) {}

    /**
     * 生成升降级附加赛赛程
     * @param playoffMatches 附加赛对阵列表
     * @param season 赛季号
     */
    async generatePlayoffFixtures(
        playoffMatches: PlayoffMatch[],
        season: number,
    ): Promise<PlayoffFixture[]> {
        const fixtures: PlayoffFixture[] = [];
        const playoffDate = this.getNextPlayoffDate();

        for (let i = 0; i < playoffMatches.length; i++) {
            const pm = playoffMatches[i];

            // 高级别联赛球队主场
            const fixture: PlayoffFixture = {
                matchId: '', // 稍后填充
                upperTeamId: pm.upperTeam.id,
                upperTeamName: pm.upperTeam.name,
                lowerTeamId: pm.lowerTeam.id,
                lowerTeamName: pm.lowerTeam.name,
                scheduledAt: playoffDate,
                venue: 'upper',
                upperLeagueId: pm.upperLeague.id,
                lowerLeagueId: pm.lowerLeague.id,
            };

            // 创建比赛记录（高级别球队主场）
            const savedMatch = await this.matchRepository.save({
                leagueId: pm.upperLeague.id,
                homeTeamId: pm.upperTeam.id,
                awayTeamId: pm.lowerTeam.id,
                season,
                week: 16, // 附加赛在第16周
                scheduledAt: playoffDate,
                status: MatchStatus.SCHEDULED,
                type: MatchType.PLAYOFF,
                tacticsLocked: false,
                homeForfeit: false,
                awayForfeit: false,
                lowerLeagueId: pm.lowerLeague.id,
            });

            fixture.matchId = savedMatch.id;
            fixtures.push(fixture);
            this.logger.log(
                `   ⚽ Playoff fixture: ${pm.upperTeam.name} vs ${pm.lowerTeam.name} at ${playoffDate.toISOString()}`
            );
        }

        return fixtures;
    }

    /**
     * 获取下一个附加赛日期（联赛最后一周周六 20:00）
     */
    private getNextPlayoffDate(): Date {
        const date = new Date();
        // 找到下周六
        const daysUntilSaturday = (6 - date.getDay() + 7) % 7 || 7;
        date.setDate(date.getDate() + daysUntilSaturday);
        date.setHours(this.PLAYOFF_HOUR, this.PLAYOFF_MINUTE, 0, 0);
        return date;
    }

    /**
     * 处理附加赛结果
     * @param matchId 比赛ID
     * @param homeScore 主队得分
     * @param awayScore 客队得分
     */
    async processPlayoffResult(
        matchId: string,
        homeScore: number,
        awayScore: number,
    ): Promise<void> {
        const match = await this.matchRepository.findOne({
            where: { id: matchId },
            relations: ['homeTeam', 'awayTeam'],
        });

        if (!match) {
            throw new Error(`Match ${matchId} not found`);
        }

        if (match.type !== MatchType.PLAYOFF) {
            throw new Error(`Match ${matchId} is not a playoff match`);
        }

        const winnerIsHome = homeScore > awayScore;
        const winnerTeam = winnerIsHome ? match.homeTeam : match.awayTeam;
        const loserTeam = winnerIsHome ? match.awayTeam : match.homeTeam;

        // 胜者升级到上级联赛，败者留在原联赛
        const winnerNewLeagueId = winnerIsHome ? (match.lowerLeagueId || match.leagueId) : match.leagueId;

        await this.promotionService.updateTeamLeagueAndStanding(
            winnerTeam!.id,
            winnerNewLeagueId,
            match.season,
        );

        this.logger.log(
            `   🏆 Playoff result: ${match.homeTeam?.name} ${homeScore} - ${awayScore} ${match.awayTeam?.name}`
        );
        this.logger.log(`   ↑ ${winnerTeam?.name} wins and is promoted to league ${winnerNewLeagueId}`);
        this.logger.log(`   → ${loserTeam?.name} loses, remains in league ${match.leagueId}`);
    }

    /**
     * 检查附加赛是否全部完成
     */
    async areAllPlayoffsCompleted(season: number): Promise<boolean> {
        const playoffMatches = await this.matchRepository.count({
            where: {
                season,
                type: MatchType.PLAYOFF,
            },
        });

        if (playoffMatches === 0) return true;

        const completedMatches = await this.matchRepository.count({
            where: {
                season,
                type: MatchType.PLAYOFF,
                status: MatchStatus.COMPLETED,
            },
        });

        return completedMatches === playoffMatches;
    }
}
