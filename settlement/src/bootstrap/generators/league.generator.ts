import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeagueEntity } from '@goalxi/database';

interface LeagueConfig {
  tier: number;
  tierDivision: number;
  name: string;
  parentLeagueId?: string;
}

/**
 * Options bag for `generatePyramid`. `small: true` builds
 * a 2-league pyramid (1 L1 + 1 L2) for local dev — every
 * other shape is the production 1+4+16+64=85-league
 * China-only pyramid.
 */
export interface GeneratePyramidOptions {
  small?: boolean;
}

@Injectable()
export class LeagueGenerator {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(LeagueEntity)
    private readonly leagueRepo: Repository<LeagueEntity>,
  ) {}

  async isAlreadyInitialized(): Promise<boolean> {
    const count = await this.leagueRepo.count();
    return count > 0;
  }

  async generatePyramid(options: GeneratePyramidOptions = {}): Promise<void> {
    if (await this.isAlreadyInitialized()) {
      this.logger.info('[LeagueGenerator] Leagues already exist, skipping');
      return;
    }

    if (options.small) {
      // Local-dev pyramid: 1 L1 + 1 L2 = 2 leagues. 32
      // teams. Round-robin schedule fits in 30 weeks.
      // Cheap enough to run on every save-and-reload.
      const l1 = await this.createLeague({
        name: '中国超级联赛',
        tier: 1,
        tierDivision: 1,
      });
      await this.createLeague({
        name: '中国甲级联赛 第1区',
        tier: 2,
        tierDivision: 1,
        parentLeagueId: l1.id,
      });
      this.logger.info(
        '[LeagueGenerator] Small pyramid complete: 2 leagues (1 L1 + 1 L2)',
      );
      return;
    }

    // L1: 1 league
    const l1 = await this.createLeague({
      name: '中国超级联赛',
      tier: 1,
      tierDivision: 1,
    });
    this.logger.info(`[LeagueGenerator] Created L1: 中国超级联赛`);

    // L2: 4 leagues, each parent is L1
    const l2Divisions = ['第1区', '第2区', '第3区', '第4区'];
    const l2Ids: string[] = [];
    for (let d = 1; d <= 4; d++) {
      const league = await this.createLeague({
        name: `中国甲级联赛 ${l2Divisions[d - 1]}`,
        tier: 2,
        tierDivision: d,
        parentLeagueId: l1.id,
      });
      l2Ids.push(league.id);
    }
    this.logger.info('[LeagueGenerator] Created L2: 4 divisions');

    // L3: 16 leagues, grouped under L2 divisions
    const l3Ids: string[] = [];
    for (let d = 1; d <= 16; d++) {
      // L3 division d belongs to L2 division Math.ceil(d / 4)
      const l2Division = Math.ceil(d / 4);
      const league = await this.createLeague({
        name: `中国乙级联赛 第${d}区`,
        tier: 3,
        tierDivision: d,
        parentLeagueId: l2Ids[l2Division - 1],
      });
      l3Ids.push(league.id);
    }
    this.logger.info('[LeagueGenerator] Created L3: 16 divisions');

    // L4: 64 leagues, grouped under L3 divisions
    for (let d = 1; d <= 64; d++) {
      // L4 division d belongs to L3 division Math.ceil(d / 4)
      const l3Division = Math.ceil(d / 4);
      await this.createLeague({
        name: `中国业余联赛 第${d}区`,
        tier: 4,
        tierDivision: d,
        parentLeagueId: l3Ids[l3Division - 1],
      });
    }
    this.logger.info('[LeagueGenerator] Created L4: 64 divisions');

    this.logger.info('[LeagueGenerator] Pyramid complete: 85 leagues total');
  }

  private async createLeague(config: LeagueConfig): Promise<LeagueEntity> {
    const league = this.leagueRepo.create({
      name: config.name,
      tier: config.tier,
      tierDivision: config.tierDivision,
      maxTeams: 16,
      promotionSlots: 1,
      playoffSlots: 4,
      relegationSlots: 4,
      status: 'active',
      parentLeagueId: config.parentLeagueId as any,
    });

    return this.leagueRepo.save(league);
  }
}
