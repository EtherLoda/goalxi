import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    MatchEntity,
    MatchTeamStatsEntity,
    TeamEntity,
    MatchStatus,
} from '@goalxi/database';
import { MatchStatsResDto } from './dto/match-stats.res.dto';
import { TeamStatsResDto } from './dto/team-stats.res.dto';

@Injectable()
export class StatsService {
    constructor(
        @InjectRepository(MatchEntity)
        private readonly matchRepository: Repository<MatchEntity>,
        @InjectRepository(MatchTeamStatsEntity)
        private readonly matchStatsRepository: Repository<MatchTeamStatsEntity>,
        @InjectRepository(TeamEntity)
        private readonly teamRepository: Repository<TeamEntity>,
    ) { }

    async getMatchStats(matchId: string): Promise<MatchStatsResDto> {
        const match = await this.matchRepository.findOne({
            where: { id: matchId },
        });

        if (!match) {
            throw new NotFoundException(`Match with ID ${matchId} not found`);
        }

        if (match.status !== MatchStatus.COMPLETED) {
            throw new NotFoundException(`Stats not available for incomplete match`);
        }

        const stats = await this.matchStatsRepository.find({
            where: { matchId: matchId as any },
        });

        const homeStats = stats.find((s) => s.teamId === match.homeTeamId);
        const awayStats = stats.find((s) => s.teamId === match.awayTeamId);

        if (!homeStats || !awayStats) {
            throw new NotFoundException(`Stats not found for match ${matchId}`);
        }

        return {
            matchId,
            homeTeamStats: homeStats,
            awayTeamStats: awayStats,
        };
    }

    async getTeamSeasonStats(teamId: string, season: number): Promise<TeamStatsResDto> {
        const team = await this.teamRepository.findOne({ where: { id: teamId as any } });
        if (!team) {
            throw new NotFoundException(`Team with ID ${teamId} not found`);
        }

        // Get all completed matches for this team in the specified season
        const matches = await this.matchRepository.find({
            where: [
                { homeTeamId: teamId, season, status: MatchStatus.COMPLETED },
                { awayTeamId: teamId, season, status: MatchStatus.COMPLETED },
            ],
        });

        const stats: TeamStatsResDto = {
            teamId,
            matchesPlayed: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            points: 0,
            cleanSheets: 0,
        };

        for (const match of matches) {
            stats.matchesPlayed++;

            const isHome = match.homeTeamId === teamId;
            const goalsFor = isHome ? match.homeScore : match.awayScore;
            const goalsAgainst = isHome ? match.awayScore : match.homeScore;

            stats.goalsFor += goalsFor;
            stats.goalsAgainst += goalsAgainst;

            if (goalsFor > goalsAgainst) {
                stats.wins++;
                stats.points += 3;
            } else if (goalsFor === goalsAgainst) {
                stats.draws++;
                stats.points += 1;
            } else {
                stats.losses++;
            }

            if (goalsAgainst === 0) {
                stats.cleanSheets++;
            }
        }

        stats.goalDifference = stats.goalsFor - stats.goalsAgainst;

        return stats;
    }
}
