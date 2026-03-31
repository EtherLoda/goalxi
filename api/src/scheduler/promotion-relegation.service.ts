import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
    LeagueEntity,
    LeagueStandingEntity,
    TeamEntity,
    SeasonResultEntity,
} from '@goalxi/database';

export interface RelegationResult {
    promoted: TeamEntity[];           // 直接升级球队
    relegated: TeamEntity[];          // 直接降级球队
    playoffMatches: PlayoffMatch[];  // 升降级附加赛对阵
}

export interface PlayoffMatch {
    upperTeam: TeamEntity;      // 高级别联赛球队（9-12名）
    lowerTeam: TeamEntity;      // 低级别联赛球队（第2名）
    upperLeague: LeagueEntity;
    lowerLeague: LeagueEntity;
}

@Injectable()
export class PromotionRelegationService {
    private readonly logger = new Logger(PromotionRelegationService.name);

    constructor(
        @InjectRepository(LeagueEntity)
        private readonly leagueRepository: Repository<LeagueEntity>,
        @InjectRepository(LeagueStandingEntity)
        private readonly standingRepository: Repository<LeagueStandingEntity>,
        @InjectRepository(TeamEntity)
        private readonly teamRepository: Repository<TeamEntity>,
        @InjectRepository(SeasonResultEntity)
        private readonly seasonResultRepository: Repository<SeasonResultEntity>,
    ) {}

    /**
     * 执行赛季结束后的升降级
     * @param leagueId 联赛ID
     * @param season 赛季号
     */
    async processSeasonEnd(leagueId: string, season: number): Promise<RelegationResult> {
        const league = await this.leagueRepository.findOne({ where: { id: leagueId as any } });
        if (!league) {
            throw new Error(`League ${leagueId} not found`);
        }

        this.logger.log(`Processing promotion/relegation for league ${league.name} (Tier ${league.tier})`);

        // 1. 获取最终排名
        const standings = await this.standingRepository.find({
            where: { leagueId, season },
            relations: ['team'],
            order: { position: 'ASC' },
        });

        if (standings.length === 0) {
            throw new Error(`No standings found for league ${leagueId} season ${season}`);
        }

        const result: RelegationResult = {
            promoted: [],
            relegated: [],
            playoffMatches: [],
        };

        // 2. 直接升级（1-4名）
        const promotedCount = league.promotionSlots; // 通常是1
        for (let i = 0; i < promotedCount && i < standings.length; i++) {
            const standing = standings[i];
            if (standing && standing.position >= 1 && standing.position <= promotedCount) {
                const team = await this.teamRepository.findOne({ where: { id: standing.teamId as any } });
                if (team) {
                    result.promoted.push(team);
                    await this.saveSeasonResult(team, league, season, standing.position, true, false);
                    this.logger.log(`   ↑ ${team.name} promoted (position ${standing.position})`);
                }
            }
        }

        // 2.5 实际执行升级 - 移动到上级联赛
        for (const team of result.promoted) {
            const upperLeague = await this.getUpperLeague(league);
            if (upperLeague) {
                await this.updateTeamLeagueAndStanding(team.id, upperLeague.id, season);
            }
        }

        // 3. 直接降级（13-16名）
        const relegationStart = league.maxTeams - league.relegationSlots + 1; // 13
        const relegationCount = league.relegationSlots;
        for (let i = 0; i < standings.length; i++) {
            const standing = standings[i];
            if (standing && standing.position >= relegationStart) {
                const team = await this.teamRepository.findOne({ where: { id: standing.teamId as any } });
                if (team) {
                    result.relegated.push(team);
                    await this.saveSeasonResult(team, league, season, standing.position, false, true);
                    this.logger.log(`   ↓ ${team.name} relegated (position ${standing.position})`);
                }
            }
        }

        // 3.5 实际执行降级 - 移动到下级联赛
        for (const team of result.relegated) {
            const lowerLeague = await this.getRandomLowerLeague(league);
            if (lowerLeague) {
                await this.updateTeamLeagueAndStanding(team.id, lowerLeague.id, season);
            }
        }

        // 4. 升降级附加赛（9-12名 vs 下级联赛第2名）
        const playoffStart = league.promotionSlots + 1; // 9
        const playoffEnd = league.promotionSlots + league.playoffSlots; // 12
        const playoffTeams = standings.filter(s => s.position >= playoffStart && s.position <= playoffEnd);

        if (playoffTeams.length > 0 && league.tier < 3) {
            // 只有非顶级和非末级联赛有附加赛
            const lowerLeagues = await this.getCorrespondingLowerLeagues(league);
            for (const standing of playoffTeams) {
                const upperTeam = await this.teamRepository.findOne({ where: { id: standing.teamId as any } });
                if (!upperTeam) continue;

                // 随机选择一个下级联赛的第2名
                const lowerLeague = lowerLeagues[Math.floor(Math.random() * lowerLeagues.length)];
                if (!lowerLeague) continue;

                const lowerSecondPlace = await this.standingRepository.findOne({
                    where: { leagueId: lowerLeague.id, season, position: 2 },
                    relations: ['team'],
                });

                if (lowerSecondPlace && lowerSecondPlace.team) {
                    result.playoffMatches.push({
                        upperTeam,
                        lowerTeam: lowerSecondPlace.team,
                        upperLeague: league,
                        lowerLeague,
                    });
                    this.logger.log(`   ⚔ ${upperTeam.name} (${league.name} ${standing.position}th) vs ${lowerSecondPlace.team.name} (${lowerLeague.name} 2nd)`);
                }
            }
        }

        return result;
    }

    /**
     * 获取对应的下级联赛（使用 parentLeagueId）
     */
    private async getCorrespondingLowerLeagues(league: LeagueEntity): Promise<LeagueEntity[]> {
        if (league.tier >= 3) return []; // 末级联赛没有下级

        // 使用 parentLeagueId 直接查找下级联赛
        return this.leagueRepository.find({
            where: { parentLeagueId: league.id },
            order: { tierDivision: 'ASC' },
        });
    }

    /**
     * 获取上级联赛（使用 parentLeagueId）
     */
    private async getUpperLeague(league: LeagueEntity): Promise<LeagueEntity | null> {
        if (league.tier <= 1) return null; // 顶级联赛没有上级

        // 使用 parentLeagueId 直接查找上级联赛
        if (league.parentLeagueId) {
            return this.leagueRepository.findOne({
                where: { id: league.parentLeagueId },
            });
        }

        // 降级：L2 -> L1, L3 -> L2（通过 tier 查找）
        const upperTier = league.tier - 1;
        const upperLeagues = await this.leagueRepository.find({
            where: { tier: upperTier },
        });
        return upperLeagues[0] || null;
    }

    /**
     * 获取一个随机下级联赛
     */
    private async getRandomLowerLeague(league: LeagueEntity): Promise<LeagueEntity | null> {
        const lowerLeagues = await this.getCorrespondingLowerLeagues(league);
        if (lowerLeagues.length === 0) return null;
        return lowerLeagues[Math.floor(Math.random() * lowerLeagues.length)];
    }

    /**
     * 更新球队联赛并迁移排名记录
     */
    async updateTeamLeagueAndStanding(teamId: string, newLeagueId: string, season: number): Promise<void> {
        // 更新球队联赛
        await this.teamRepository.update({ id: teamId as any }, { leagueId: newLeagueId });

        // 删除原联赛排名
        await this.standingRepository.delete({ teamId: teamId as any, season });

        // 在新联赛创建排名记录
        const newLeague = await this.leagueRepository.findOne({ where: { id: newLeagueId as any } });
        if (newLeague) {
            const currentTeams = await this.standingRepository.count({ where: { leagueId: newLeagueId, season } });
            const standing = this.standingRepository.create({
                teamId,
                leagueId: newLeagueId,
                season,
                position: currentTeams + 1,
                played: 0,
                points: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                goalsFor: 0,
                goalsAgainst: 0,
                goalDifference: 0,
                recentForm: '',
            });
            await this.standingRepository.save(standing);
        }

        this.logger.log(`   → Team ${teamId} moved to league ${newLeagueId}`);
    }

    /**
     * 保存赛季结果
     */
    private async saveSeasonResult(
        team: TeamEntity,
        league: LeagueEntity,
        season: number,
        finalPosition: number,
        promoted: boolean,
        relegated: boolean,
    ): Promise<void> {
        // 查找现有记录
        let result = await this.seasonResultRepository.findOne({
            where: { teamId: team.id, season },
        });

        if (result) {
            result.finalPosition = finalPosition;
            result.promoted = promoted;
            result.relegated = relegated;
        } else {
            result = this.seasonResultRepository.create({
                teamId: team.id,
                leagueId: league.id,
                season,
                finalPosition,
                promoted,
                relegated,
            });
        }

        await this.seasonResultRepository.save(result);
    }

    /**
     * 更新球队联赛（升降级后）
     */
    async updateTeamLeague(teamId: string, newLeagueId: string): Promise<void> {
        await this.teamRepository.update({ id: teamId as any }, { leagueId: newLeagueId });
        this.logger.log(`   → Team ${teamId} moved to league ${newLeagueId}`);
    }

    /**
     * 执行升降级附加赛结果
     * @param playoffMatchId 附加赛ID（在PlayoffService中生成）
     * @param winnerIsUpperTeam 高级别联赛球队是否获胜
     */
    async processPlayoffResult(
        playoffMatch: PlayoffMatch,
        winnerIsUpperTeam: boolean,
    ): Promise<void> {
        const winner = winnerIsUpperTeam ? playoffMatch.upperTeam : playoffMatch.lowerTeam;
        const loser = winnerIsUpperTeam ? playoffMatch.lowerTeam : playoffMatch.upperTeam;
        const winnerLeague = winnerIsUpperTeam ? playoffMatch.upperLeague : playoffMatch.lowerLeague;
        const loserLeague = winnerIsUpperTeam ? playoffMatch.lowerLeague : playoffMatch.upperLeague;

        // 胜者升级
        await this.updateTeamLeague(winner.id, winnerLeague.id);
        this.logger.log(`   ↑ ${winner.name} wins playoff and is promoted to ${winnerLeague.name}`);

        // 败者保持原联赛（附加赛输了不降级，保持原联赛）
        this.logger.log(`   → ${loser.name} loses playoff, remains in ${loserLeague.name}`);
    }
}
