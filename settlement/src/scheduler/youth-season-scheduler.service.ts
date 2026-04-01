import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { YouthMatchEntity, YouthMatchStatus } from '@goalxi/database';

@Injectable()
export class YouthSeasonSchedulerService {
    private readonly logger = new Logger(YouthSeasonSchedulerService.name);

    private readonly MATCH_DAYS = [3, 6];
    private readonly MATCH_HOUR = 13;
    private readonly MATCH_MINUTE = 0;

    constructor(
        @InjectRepository(YouthMatchEntity)
        private readonly matchRepository: Repository<YouthMatchEntity>,
    ) {}

    async generateSeasonSchedule(
        youthLeagueId: string,
        youthTeamIds: string[],
        season: number,
        startDate: Date,
    ): Promise<YouthMatchEntity[]> {
        if (youthTeamIds.length % 2 !== 0) {
            throw new Error('Number of youth teams must be even');
        }

        if (youthTeamIds.length < 4) {
            throw new Error('Youth league must have at least 4 teams');
        }

        this.logger.log(`Generating youth season ${season} schedule for league ${youthLeagueId} with ${youthTeamIds.length} teams`);

        const numRounds = youthTeamIds.length - 1;
        const leagueWeeks = numRounds;
        const matchDates = this.calculateMatchDates(startDate, leagueWeeks);
        const matches = this.generateDoubleRoundRobin(youthTeamIds, youthLeagueId, season, matchDates);

        const savedMatches = await this.matchRepository.save(matches);

        this.logger.log(
            `Generated ${savedMatches.length} youth matches for league ${youthLeagueId} season ${season}`
        );

        return savedMatches;
    }

    private calculateMatchDates(startDate: Date, weeks: number): Date[] {
        const dates: Date[] = [];
        let currentDate = new Date(startDate);

        while (currentDate.getDay() !== 3) {
            currentDate.setDate(currentDate.getDate() + 1);
        }

        for (let week = 0; week < weeks; week++) {
            for (const matchDay of this.MATCH_DAYS) {
                const matchDate = new Date(currentDate);
                while (matchDate.getDay() !== matchDay) {
                    matchDate.setDate(matchDate.getDate() + 1);
                }
                matchDate.setHours(this.MATCH_HOUR, this.MATCH_MINUTE, 0, 0);
                dates.push(matchDate);
            }
            currentDate.setDate(currentDate.getDate() + 7);
        }

        return dates;
    }

    private generateDoubleRoundRobin(
        youthTeamIds: string[],
        youthLeagueId: string,
        season: number,
        matchDates: Date[],
    ): Partial<YouthMatchEntity>[] {
        const matches: Partial<YouthMatchEntity>[] = [];
        const numRounds = youthTeamIds.length - 1;

        const fixedTeam = youthTeamIds[0];
        const rotatingTeams = youthTeamIds.slice(1);

        for (let round = 0; round < numRounds; round++) {
            const roundMatchups = this.generateRoundMatchups(
                fixedTeam,
                this.rotateTeams(rotatingTeams, round),
            );

            const roundMatchDateIndices = [round * 2, round * 2 + 1];
            const roundMatchDates = roundMatchDateIndices.map(idx => matchDates[idx]);

            for (let i = 0; i < roundMatchups.length; i++) {
                const { home, away } = roundMatchups[i];
                matches.push({
                    youthLeagueId,
                    homeYouthTeamId: home,
                    awayYouthTeamId: away,
                    season,
                    week: round + 1,
                    scheduledAt: roundMatchDates[i % 2],
                    status: YouthMatchStatus.SCHEDULED,
                    tacticsLocked: false,
                    homeForfeit: false,
                    awayForfeit: false,
                });
            }
        }

        for (let round = 0; round < numRounds; round++) {
            const roundMatchups = this.generateRoundMatchups(
                fixedTeam,
                this.rotateTeams(rotatingTeams, round),
            );

            const roundMatchDateIndices = [round * 2, round * 2 + 1];
            const roundMatchDates = roundMatchDateIndices.map(idx => matchDates[idx]);

            for (let i = 0; i < roundMatchups.length; i++) {
                const { home, away } = roundMatchups[i];
                matches.push({
                    youthLeagueId,
                    homeYouthTeamId: away,
                    awayYouthTeamId: home,
                    season,
                    week: numRounds + round + 1,
                    scheduledAt: roundMatchDates[i % 2],
                    status: YouthMatchStatus.SCHEDULED,
                    tacticsLocked: false,
                    homeForfeit: false,
                    awayForfeit: false,
                });
            }
        }

        return matches;
    }

    private generateRoundMatchups(
        fixedTeam: string,
        rotatingTeams: string[],
    ): Array<{ home: string; away: string }> {
        const matchups: Array<{ home: string; away: string }> = [];

        matchups.push({
            home: fixedTeam,
            away: rotatingTeams[0],
        });

        for (let i = 1; i < rotatingTeams.length / 2; i++) {
            matchups.push({
                home: rotatingTeams[rotatingTeams.length - i],
                away: rotatingTeams[i],
            });
        }

        return matchups;
    }

    private rotateTeams(teams: string[], round: number): string[] {
        const rotated = [...teams];
        const last = rotated.pop()!;
        rotated.unshift(last);
        return rotated;
    }

    async isSeasonScheduleComplete(youthLeagueId: string, season: number, maxTeams: number = 16): Promise<boolean> {
        const matchCount = await this.matchRepository.count({
            where: { youthLeagueId, season },
        });
        const expectedMatchCount = maxTeams * (maxTeams - 1);
        return matchCount >= expectedMatchCount;
    }
}
