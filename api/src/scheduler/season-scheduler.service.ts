import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchEntity, MatchStatus, MatchType, GAME_SETTINGS } from '@goalxi/database';

/**
 * Season Scheduler Service
 *
 * 赛程生成规则：
 * - 每周2赛：周三 13:00 和 周六 13:00
 * - 联赛共15周 + 1周升降级附加赛 = 16周
 * - 每联赛16队，双循环赛制：30场/队
 */
@Injectable()
export class SeasonSchedulerService {
    private readonly logger = new Logger(SeasonSchedulerService.name);

    // 每周比赛日（0=周日，3=周三，6=周六）
    private readonly MATCH_DAYS = [3, 6]; // 周三、周六
    private readonly MATCH_HOUR = 13; // 下午1点
    private readonly MATCH_MINUTE = 0;

    // 联赛阶段
    private readonly LEAGUE_WEEKS = 15; // 联赛进行15周
    private readonly PLAYOFF_WEEK = 16; // 第16周升降级附加赛

    constructor(
        @InjectRepository(MatchEntity)
        private readonly matchRepository: Repository<MatchEntity>,
    ) {}

    /**
     * 生成赛季赛程
     * @param leagueId 联赛ID
     * @param teamIds 联赛球队ID列表
     * @param season 赛季号
     * @param startDate 赛季开始日期
     */
    async generateSeasonSchedule(
        leagueId: string,
        teamIds: string[],
        season: number,
        startDate: Date,
    ): Promise<MatchEntity[]> {
        if (teamIds.length % 2 !== 0) {
            throw new Error('Number of teams must be even');
        }

        if (teamIds.length < 4) {
            throw new Error('League must have at least 4 teams');
        }

        this.logger.log(`Generating season ${season} schedule for league ${leagueId} with ${teamIds.length} teams`);

        // 计算轮数 = teamIds.length - 1 (每队需要对阵其他队伍各一次)
        const numRounds = teamIds.length - 1;
        // 联赛周数等于轮数
        const leagueWeeks = numRounds;

        // 计算每周比赛日的时间
        const matchDates = this.calculateMatchDates(startDate, leagueWeeks);

        // 生成双循环赛程
        const matches = this.generateDoubleRoundRobin(teamIds, leagueId, season, matchDates);

        // 保存所有比赛
        const savedMatches = await this.matchRepository.save(matches);

        this.logger.log(
            `Generated ${savedMatches.length} matches for league ${leagueId} season ${season}`
        );

        return savedMatches;
    }

    /**
     * 计算每个比赛日的日期
     */
    private calculateMatchDates(startDate: Date, weeks: number): Date[] {
        const dates: Date[] = [];
        let currentDate = new Date(startDate);

        // 找到第一个周三
        while (currentDate.getDay() !== 3) {
            currentDate.setDate(currentDate.getDate() + 1);
        }

        for (let week = 0; week < weeks; week++) {
            // 每周两个比赛日
            for (let matchDay of this.MATCH_DAYS) {
                const matchDate = new Date(currentDate);
                // 找到本周的对应比赛日
                while (matchDate.getDay() !== matchDay) {
                    matchDate.setDate(matchDate.getDate() + 1);
                }
                matchDate.setHours(this.MATCH_HOUR, this.MATCH_MINUTE, 0, 0);
                dates.push(matchDate);
            }
            // 移到下一周
            currentDate.setDate(currentDate.getDate() + 7);
        }

        return dates;
    }

    /**
     * 生成双循环赛程
     * 双循环：n队各对阵两次 = n*(n-1)场
     * 每轮2场比赛日，每队每周1场
     */
    private generateDoubleRoundRobin(
        teamIds: string[],
        leagueId: string,
        season: number,
        matchDates: Date[],
    ): Partial<MatchEntity>[] {
        const matches: Partial<MatchEntity>[] = [];
        const numRounds = teamIds.length - 1; // 15轮
        const matchesPerRound = teamIds.length / 2; // 每轮8场

        // 创建固定位置的数组用于轮转
        const fixedTeam = teamIds[0]; // 第一队固定
        const rotatingTeams = teamIds.slice(1); // 其他15队轮转

        // 赛季第一半（主场）
        for (let round = 0; round < numRounds; round++) {
            const roundMatchups = this.generateRoundMatchups(
                fixedTeam,
                this.rotateTeams(rotatingTeams, round),
            );

            // 每轮两场比赛日
            const roundMatchDateIndices = [round * 2, round * 2 + 1];
            const roundMatchDates = roundMatchDateIndices.map(idx => matchDates[idx]);

            // 添加该轮所有比赛
            for (let i = 0; i < roundMatchups.length; i++) {
                const { home, away } = roundMatchups[i];
                matches.push({
                    leagueId,
                    homeTeamId: home,
                    awayTeamId: away,
                    season,
                    week: round + 1,
                    scheduledAt: roundMatchDates[i % 2], // 奇数场周三，偶数场周六
                    status: MatchStatus.SCHEDULED,
                    type: MatchType.LEAGUE,
                    tacticsLocked: false,
                    homeForfeit: false,
                    awayForfeit: false,
                });
            }
        }

        // 赛季第二半（客场，对调主客场）
        for (let round = 0; round < numRounds; round++) {
            const roundMatchups = this.generateRoundMatchups(
                fixedTeam,
                this.rotateTeams(rotatingTeams, round),
            );

            const roundMatchDateIndices = [round * 2, round * 2 + 1];
            const roundMatchDates = roundMatchDateIndices.map(idx => matchDates[idx]);

            // 主客场对调
            for (let i = 0; i < roundMatchups.length; i++) {
                const { home, away } = roundMatchups[i];
                matches.push({
                    leagueId,
                    homeTeamId: away, // 对调
                    awayTeamId: home,
                    season,
                    week: numRounds + round + 1,
                    scheduledAt: roundMatchDates[i % 2],
                    status: MatchStatus.SCHEDULED,
                    type: MatchType.LEAGUE,
                    tacticsLocked: false,
                    homeForfeit: false,
                    awayForfeit: false,
                });
            }
        }

        return matches;
    }

    /**
     * 生成单轮比赛对阵
     */
    private generateRoundMatchups(
        fixedTeam: string,
        rotatingTeams: string[],
    ): Array<{ home: string; away: string }> {
        const matchups: Array<{ home: string; away: string }> = [];

        // 第一队作为主场对阵rotatingTeams[0]
        matchups.push({
            home: fixedTeam,
            away: rotatingTeams[0],
        });

        // 其他对阵：数组两端配对
        for (let i = 1; i < rotatingTeams.length / 2; i++) {
            matchups.push({
                home: rotatingTeams[rotatingTeams.length - i],
                away: rotatingTeams[i],
            });
        }

        return matchups;
    }

    /**
     * 轮转球队数组（标准循环算法）
     */
    private rotateTeams(teams: string[], round: number): string[] {
        // 每轮轮转：最后一个移到第一位，其他后移
        const rotated = [...teams];
        const last = rotated.pop()!;
        rotated.unshift(last);
        return rotated;
    }

    /**
     * 检查并生成下周比赛（备用方法）
     * 当前设计是一次性生成全部赛程，此方法暂未使用
     */
    @Cron('0 0 * * 0') // 每周日检查
    async checkAndGenerateUpcomingMatches() {
        this.logger.debug('[SeasonScheduler] Checking for upcoming matches...');
        // TODO: 如果需要动态生成赛程，在此实现
    }

    /**
     * 获取联赛当前赛季的最大周数
     */
    async getCurrentSeasonWeek(leagueId: string): Promise<number> {
        const latestMatch = await this.matchRepository.findOne({
            where: { leagueId },
            order: { week: 'DESC' },
            select: ['week'],
        });
        return latestMatch?.week ?? 0;
    }

    /**
     * 检查联赛赛程是否已全部生成
     * @param leagueId 联赛ID
     * @param season 赛季号
     * @param maxTeams 联赛球队数（默认16）
     */
    async isSeasonScheduleComplete(leagueId: string, season: number, maxTeams: number = 16): Promise<boolean> {
        const matchCount = await this.matchRepository.count({
            where: { leagueId, season },
        });
        // 双循环总场次 = n * (n-1)，其中n为球队数
        // 16队 = 240场, 8队 = 56场, 4队 = 12场
        const expectedMatchCount = maxTeams * (maxTeams - 1);
        return matchCount >= expectedMatchCount;
    }

    /**
     * 获取球队在某赛季的总比赛数
     */
    async getTeamMatchesPlayed(teamId: string, season: number): Promise<number> {
        const homeMatches = await this.matchRepository.count({
            where: { homeTeamId: teamId, season, status: MatchStatus.COMPLETED },
        });
        const awayMatches = await this.matchRepository.count({
            where: { awayTeamId: teamId, season, status: MatchStatus.COMPLETED },
        });
        return homeMatches + awayMatches;
    }
}
