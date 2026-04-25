import { TeamResDto } from '@/api/team/dto/team.res.dto';
import {
  TeamEntity,
  TransferTransactionEntity,
  TransferTransactionStatus,
  TransferTransactionType,
} from '@goalxi/database';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { In, Repository } from 'typeorm';
import {
  LeagueNewsItemDto,
  LeagueNewsItemType,
  LeagueNewsResDto,
} from './dto/league-news.res.dto';

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(TransferTransactionEntity)
    private readonly transferTxRepo: Repository<TransferTransactionEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
  ) {}

  /**
   * Get recent news for a league: transfers, match results, and prize money
   */
  async getLeagueNews(
    leagueId: string,
    season?: number,
    limit = 20,
  ): Promise<LeagueNewsResDto> {
    const items: LeagueNewsItemDto[] = [];

    // Get all teams in this league
    const teams = await this.teamRepo.find({
      where: { leagueId },
      select: ['id', 'name'],
    });
    const teamIds = teams.map((t) => t.id);

    if (teamIds.length === 0) {
      return { items: [], total: 0 };
    }

    // Fetch recent transfers (completed) for teams in this league
    const transfers = await this.transferTxRepo.find({
      where: [
        {
          fromTeamId: In(teamIds),
          status: TransferTransactionStatus.COMPLETED,
        },
        { toTeamId: In(teamIds), status: TransferTransactionStatus.COMPLETED },
      ],
      relations: ['player', 'fromTeam', 'toTeam'],
      order: { settledAt: 'DESC' },
    });

    // Filter and map transfers to news items
    const seenTransferIds = new Set<string>();
    for (const tx of transfers) {
      if (seenTransferIds.has(tx.id)) continue;
      seenTransferIds.add(tx.id);

      if (!season || tx.season === season) {
        const newsItem = new LeagueNewsItemDto();
        newsItem.id = tx.id;
        newsItem.type = LeagueNewsItemType.TRANSFER;
        newsItem.date = tx.settledAt || tx.createdAt;
        newsItem.season = tx.season;
        newsItem.week = 16; // Transfers happen at end of season
        newsItem.playerId = tx.playerId;
        newsItem.playerName = tx.player?.name;
        newsItem.fromTeam = plainToInstance(TeamResDto, tx.fromTeam, {
          excludePrefixes: [],
        });
        newsItem.toTeam = plainToInstance(TeamResDto, tx.toTeam, {
          excludePrefixes: [],
        });
        newsItem.amount = tx.amount;
        newsItem.title =
          tx.type === TransferTransactionType.BUYOUT ? 'Buyout' : 'Auction';
        newsItem.description = `${tx.player?.name || 'Player'} transferred from ${tx.fromTeam?.name || 'Team'} to ${tx.toTeam?.name || 'Team'} for ${this.formatAmount(tx.amount)}`;
        items.push(newsItem);
      }
    }

    // Skipping match results and prize money per user request
    // News only includes transfers

    // Sort all items by date descending
    items.sort((a, b) => {
      const dateA = a.date instanceof Date ? a.date : new Date(a.date);
      const dateB = b.date instanceof Date ? b.date : new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });

    // Limit results
    const limitedItems = items.slice(0, limit);

    return {
      items: limitedItems,
      total: items.length,
    };
  }

  private formatAmount(amount: number): string {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(0)}K`;
    }
    return amount.toString();
  }
}
