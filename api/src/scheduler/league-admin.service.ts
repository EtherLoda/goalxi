import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
    LeagueEntity,
    LeagueStandingEntity,
    TeamEntity,
} from '@goalxi/database';

/**
 * League Admin Service
 *
 * 联赛管理功能：
 * - 创建新联赛
 * - 添加/移除球队
 * - 联赛初始化（生成赛程、初始化 standings）
 * - 赛季开始/结束
 */
@Injectable()
export class LeagueAdminService {
    private readonly logger = new Logger(LeagueAdminService.name);

    constructor(
        @InjectRepository(LeagueEntity)
        private readonly leagueRepository: Repository<LeagueEntity>,
        @InjectRepository(LeagueStandingEntity)
        private readonly standingRepository: Repository<LeagueStandingEntity>,
        @InjectRepository(TeamEntity)
        private readonly teamRepository: Repository<TeamEntity>,
        private readonly dataSource: DataSource,
    ) {}

    /**
     * 创建新联赛
     */
    async createLeague(
        name: string,
        tier: number,
        tierDivision: number,
    ): Promise<LeagueEntity> {
        // 检查是否已存在同名联赛
        const existing = await this.leagueRepository.findOne({ where: { name } });
        if (existing) {
            throw new BadRequestException(`League "${name}" already exists`);
        }

        const league = this.leagueRepository.create({
            name,
            tier,
            tierDivision,
            maxTeams: 16,
            promotionSlots: 1,
            playoffSlots: 4,
            relegationSlots: 4,
            status: 'active',
        });

        await this.leagueRepository.save(league);
        this.logger.log(`Created league: ${name} (Tier ${tier}, Division ${tierDivision})`);
        return league;
    }

    /**
     * 将球队添加到联赛
     */
    async addTeamToLeague(teamId: string, leagueId: string, season: number = 1): Promise<void> {
        const team = await this.teamRepository.findOne({ where: { id: teamId as any } });
        if (!team) {
            throw new BadRequestException(`Team ${teamId} not found`);
        }

        const league = await this.leagueRepository.findOne({ where: { id: leagueId as any } });
        if (!league) {
            throw new BadRequestException(`League ${leagueId} not found`);
        }

        // 检查联赛是否满员
        const currentTeams = await this.standingRepository.count({ where: { leagueId } });
        if (currentTeams >= league.maxTeams) {
            throw new BadRequestException(`League ${league.name} is full (${league.maxTeams} teams)`);
        }

        // 检查球队是否已在该联赛有排名
        const existingStanding = await this.standingRepository.findOne({
            where: { teamId, leagueId, season },
        });
        if (existingStanding) {
            throw new BadRequestException(`Team ${team.name} already in league ${league.name}`);
        }

        // 更新球队联赛
        team.leagueId = leagueId;
        await this.teamRepository.save(team);

        // 创建联赛排名记录
        const standing = this.standingRepository.create({
            teamId,
            leagueId,
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

        this.logger.log(`Added team ${team.name} to league ${league.name} (season ${season})`);
    }

    /**
     * 从联赛移除球队
     */
    async removeTeamFromLeague(teamId: string): Promise<void> {
        const team = await this.teamRepository.findOne({ where: { id: teamId as any } });
        if (!team) {
            throw new BadRequestException(`Team ${teamId} not found`);
        }

        // 删除球队在联赛的排名记录
        await this.standingRepository.delete({ teamId: teamId as any });

        // 清除球队联赛关联
        team.leagueId = null;
        await this.teamRepository.save(team);

        this.logger.log(`Removed team ${team.name} from league`);
    }

    /**
     * 获取联赛可入驻的空位
     */
    async getAvailableSlots(leagueId: string): Promise<number> {
        const league = await this.leagueRepository.findOne({ where: { id: leagueId as any } });
        if (!league) return 0;

        const currentTeams = await this.standingRepository.count({ where: { leagueId } });
        return Math.max(0, league.maxTeams - currentTeams);
    }

    /**
     * 获取联赛当前赛季信息
     */
    async getLeagueSeasonInfo(leagueId: string, season: number): Promise<{
        totalMatches: number;
        completedMatches: number;
        currentWeek: number;
        isComplete: boolean;
    }> {
        const league = await this.leagueRepository.findOne({ where: { id: leagueId as any } });
        if (!league) {
            throw new BadRequestException(`League ${leagueId} not found`);
        }

        // 查询比赛数量
        const { MatchEntity } = await import('@goalxi/database');
        const matchRepo = this.dataSource.getRepository(MatchEntity);
        const totalMatches = await matchRepo.count({ where: { leagueId, season } });
        const completedMatches = await matchRepo.count({
            where: { leagueId, season, status: 'completed' as any },
        });

        // 获取当前周
        const latestMatch = await matchRepo.findOne({
            where: { leagueId, season },
            order: { week: 'DESC' },
        });

        return {
            totalMatches,
            completedMatches,
            currentWeek: latestMatch?.week ?? 0,
            isComplete: completedMatches >= totalMatches && totalMatches > 0,
        };
    }
}
