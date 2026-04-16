import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PlayerCompetitionStatsEntity,
  TransactionEntity,
  PlayerEventEntity,
  LeagueStandingEntity,
  ArchivedSeasonResultEntity,
  ArchivedPlayerCompetitionStatsEntity,
  ArchivedTransactionEntity,
  ArchivedPlayerEventEntity,
} from '@goalxi/database';

export interface ArchiveSummary {
  season: number;
  seasonResultCount: number;
  playerStatsCount: number;
  transactionCount: number;
  playerEventCount: number;
}

@Injectable()
export class SeasonArchiveService {
  private readonly logger = new Logger(SeasonArchiveService.name);

  constructor(
    @InjectRepository(PlayerCompetitionStatsEntity)
    private readonly playerStatsRepo: Repository<PlayerCompetitionStatsEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    @InjectRepository(PlayerEventEntity)
    private readonly playerEventRepo: Repository<PlayerEventEntity>,
    @InjectRepository(LeagueStandingEntity)
    private readonly standingRepo: Repository<LeagueStandingEntity>,
    @InjectRepository(ArchivedSeasonResultEntity)
    private readonly archivedSeasonResultRepo: Repository<ArchivedSeasonResultEntity>,
    @InjectRepository(ArchivedPlayerCompetitionStatsEntity)
    private readonly archivedPlayerStatsRepo: Repository<ArchivedPlayerCompetitionStatsEntity>,
    @InjectRepository(ArchivedTransactionEntity)
    private readonly archivedTransactionRepo: Repository<ArchivedTransactionEntity>,
    @InjectRepository(ArchivedPlayerEventEntity)
    private readonly archivedPlayerEventRepo: Repository<ArchivedPlayerEventEntity>,
  ) {}

  /**
   * Archive all data for a completed season
   * Called during season transition (checkAndProcessSeasonStart)
   */
  async archiveSeason(season: number): Promise<ArchiveSummary> {
    this.logger.log(`[SeasonArchive] Starting archive process for Season ${season}`);

    const summary: ArchiveSummary = {
      season,
      seasonResultCount: 0,
      playerStatsCount: 0,
      transactionCount: 0,
      playerEventCount: 0,
    };

    // 1. Archive season results with FULL stats
    summary.seasonResultCount = await this.archiveSeasonResults(season);

    // 2. Archive player competition stats
    summary.playerStatsCount = await this.archivePlayerCompetitionStats(season);

    // 3. Archive transactions
    summary.transactionCount = await this.archiveTransactions(season);

    // 4. Archive player events
    summary.playerEventCount = await this.archivePlayerEvents(season);

    this.logger.log(
      `[SeasonArchive] Archive complete for Season ${season}: ${JSON.stringify(summary)}`,
    );
    return summary;
  }

  /**
   * Archive season results - captures FULL stats from LeagueStandingEntity
   */
  private async archiveSeasonResults(season: number): Promise<number> {
    const standings = await this.standingRepo.find({
      where: { season },
      relations: ['team', 'league'],
    });

    if (standings.length === 0) {
      this.logger.warn(`[SeasonArchive] No standings found for Season ${season}`);
      return 0;
    }

    const archivedRecords = standings.map((standing) => {
      const league = standing.league as any;
      return this.archivedSeasonResultRepo.create({
        teamId: standing.teamId,
        leagueId: standing.leagueId,
        season,
        finalPosition: standing.position,
        points: standing.points,
        wins: standing.wins,
        draws: standing.draws,
        losses: standing.losses,
        goalsFor: standing.goalsFor,
        goalsAgainst: standing.goalsAgainst,
        goalDifference: standing.goalDifference,
        promoted: standing.position <= league?.promotionSlots,
        relegated:
          standing.position >= league?.maxTeams - league?.relegationSlots + 1,
        archivedAt: new Date(),
      });
    });

    await this.archivedSeasonResultRepo.insert(archivedRecords);
    this.logger.log(
      `[SeasonArchive] Archived ${archivedRecords.length} season results`,
    );
    return archivedRecords.length;
  }

  /**
   * Archive player competition stats for a season
   */
  private async archivePlayerCompetitionStats(
    season: number,
  ): Promise<number> {
    const stats = await this.playerStatsRepo.find({ where: { season } });

    if (stats.length === 0) {
      this.logger.warn(
        `[SeasonArchive] No player competition stats found for Season ${season}`,
      );
      return 0;
    }

    const archivedRecords = stats.map((s) =>
      this.archivedPlayerStatsRepo.create({
        playerId: s.playerId,
        leagueId: s.leagueId,
        season: s.season,
        goals: s.goals,
        assists: s.assists,
        tackles: s.tackles,
        yellowCards: s.yellowCards,
        redCards: s.redCards,
        starts: s.starts,
        substituteAppearances: s.substituteAppearances,
        appearances: s.appearances,
        archivedAt: new Date(),
      }),
    );

    await this.archivedPlayerStatsRepo.insert(archivedRecords);
    this.logger.log(
      `[SeasonArchive] Archived ${archivedRecords.length} player competition stats`,
    );
    return archivedRecords.length;
  }

  /**
   * Archive transactions for a season
   */
  private async archiveTransactions(season: number): Promise<number> {
    const transactions = await this.transactionRepo.find({ where: { season } });

    if (transactions.length === 0) {
      this.logger.warn(
        `[SeasonArchive] No transactions found for Season ${season}`,
      );
      return 0;
    }

    const archivedRecords = transactions.map((t) =>
      this.archivedTransactionRepo.create({
        teamId: t.teamId,
        season: t.season,
        amount: t.amount,
        type: t.type,
        description: t.description,
        relatedId: t.relatedId,
        archivedAt: new Date(),
      }),
    );

    await this.archivedTransactionRepo.insert(archivedRecords);
    this.logger.log(
      `[SeasonArchive] Archived ${archivedRecords.length} transactions`,
    );
    return archivedRecords.length;
  }

  /**
   * Archive player events for a season
   */
  private async archivePlayerEvents(season: number): Promise<number> {
    const events = await this.playerEventRepo.find({ where: { season } });

    if (events.length === 0) {
      this.logger.warn(`[SeasonArchive] No player events found for Season ${season}`);
      return 0;
    }

    const archivedRecords = events.map((e) =>
      this.archivedPlayerEventRepo.create({
        playerId: e.playerId,
        season: e.season,
        date: e.date,
        eventType: e.eventType,
        icon: e.icon,
        titleKey: e.titleKey,
        matchId: e.matchId,
        titleData: e.titleData,
        details: e.details,
        archivedAt: new Date(),
      }),
    );

    await this.archivedPlayerEventRepo.insert(archivedRecords);
    this.logger.log(
      `[SeasonArchive] Archived ${archivedRecords.length} player events`,
    );
    return archivedRecords.length;
  }
}
