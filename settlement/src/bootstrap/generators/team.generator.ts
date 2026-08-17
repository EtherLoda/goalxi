import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  TeamEntity,
  PlayerEntity,
  StaffEntity,
  LeagueEntity,
  createTeam,
  generateUniqueShortCode,
} from '@goalxi/database';

// Chinese cities for team naming
const L1_CITIES = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '成都',
  '武汉',
  '杭州',
  '南京',
];
const L2_CITIES = [
  '西安',
  '苏州',
  '天津',
  '重庆',
  '长沙',
  '郑州',
  '济南',
  '青岛',
  '大连',
  '沈阳',
  '长春',
  '哈尔滨',
  '石家庄',
  '福州',
  '厦门',
  '南昌',
  '合肥',
  '昆明',
  '太原',
  '贵阳',
  '南宁',
  '海口',
  '兰州',
  '乌鲁木齐',
  '呼和浩特',
  '银川',
  '西宁',
  '拉萨',
  '徐州',
  '烟台',
  '潍坊',
  '温州',
  '绍兴',
  '扬州',
  '南通',
  '常州',
  '金华',
  '嘉兴',
  '台州',
  '湖州',
  '镇江',
  '泰州',
  '盐城',
  '淮安',
  '连云港',
  '宿迁',
  '丽水',
  '衢州',
  '舟山',
  '珠海',
  '中山',
  '东莞',
  '佛山',
  '汕头',
  '惠州',
  '江门',
  '湛江',
  '茂名',
  '肇庆',
  '韶关',
  '桂林',
  '柳州',
  '北海',
  '三亚',
];

const SUFFIXES = ['FC', 'United', 'Club', 'City', 'Athletic'];

/**
 * Options bag for `generateAllTeams`. `small: true` matches
 * the `LeagueGenerator` small-pyramid mode (1 L1 + 1 L2 =
 * 32 teams). Default is the full 1+4+16+64 league × 16
 * team = 1360 teams pyramid.
 */
export interface GenerateAllTeamsOptions {
  small?: boolean;
}

@Injectable()
export class TeamGenerator {
  private cityIndex = 0;

  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectRepository(PlayerEntity)
    private playerRepo: Repository<PlayerEntity>,
    @InjectRepository(StaffEntity)
    private staffRepo: Repository<StaffEntity>,
    @InjectRepository(LeagueEntity)
    private leagueRepo: Repository<LeagueEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async generateAllTeams(
    botUserId: string,
    options: GenerateAllTeamsOptions = {},
  ): Promise<void> {
    const count = await this.teamRepo.count();
    if (count > 0) {
      this.logger.info(
        `[TeamGenerator] ${count} teams already exist, skipping`,
      );
      return;
    }

    const leagues = await this.leagueRepo.find();
    this.logger.info(
      `[TeamGenerator] Generating teams for ${leagues.length} leagues...`,
    );

    // Small mode: only the first 2 leagues (L1 + L2 div 1)
    // get teams. The rest are left empty so the schedule
    // generator's "needs 4+ teams" guard skips them.
    const targetLeagues = options.small ? leagues.slice(0, 2) : leagues;

    let teamCount = 0;
    for (const league of targetLeagues) {
      for (let i = 0; i < league.maxTeams; i++) {
        const teamName = this.generateTeamName(league.tier, teamCount);
        await this.createBotTeam(league, teamName, botUserId);
        teamCount++;
      }
    }

    this.logger.info(`[TeamGenerator] Created ${teamCount} teams`);
  }

  private generateTeamName(tier: number, index: number): string {
    let cities: string[];
    if (tier === 1) {
      cities = L1_CITIES;
    } else {
      cities = L2_CITIES;
    }

    const city = cities[index % cities.length];
    const suffix = SUFFIXES[index % SUFFIXES.length];

    // Add number suffix if we run out of unique combinations
    if (index >= cities.length * SUFFIXES.length) {
      const num = Math.floor(index / (cities.length * SUFFIXES.length)) + 1;
      return `${city}${suffix} ${num}`;
    }

    return `${city}${suffix}`;
  }

  /**
   * Single-team bootstrap path. Delegates to the shared
   * `@goalxi/database` `createTeam` so a bot's squad shape
   * (16 players, 25-40 OVR, v2 specialty distribution) is
   * identical to a manager's first squad — only the
   * `isBot` / `userId` / starting balance / starting fans
   * differ.
   *
   * Pre-generates a unique `shortCode` so the `team.shortCode`
   * column (which has a DB-level UNIQUE constraint) doesn't
   * fail on insert. The 5-char code is exposed in URLs and
   * the UI; the UUID `id` stays the internal PK.
   */
  private async createBotTeam(
    league: LeagueEntity,
    teamName: string,
    botUserId: string,
  ): Promise<void> {
    const manager = this.dataSource.manager;
    const shortCode = await generateUniqueShortCode(async (code) => {
      const taken = await manager.findOne(TeamEntity, {
        where: { shortCode: code },
      });
      return taken !== null;
    });
    await createTeam(manager, {
      leagueId: league.id,
      name: teamName,
      nationality: 'CN',
      isBot: true,
      botLevel: 5,
      userId: botUserId,
      shortCode,
      season: 1,
    });
  }
}
