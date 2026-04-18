import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeagueEntity } from '@goalxi/database';

interface LeagueConfig {
  tier: number;
  tierDivision: number;
  name: string;
  parentLeagueId?: string;
}

@Injectable()
export class LeagueGenerator {
  private readonly logger = new Logger(LeagueGenerator.name);

  constructor(
    @InjectRepository(LeagueEntity)
    private leagueRepo: Repository<LeagueEntity>,
  ) {}

  async isAlreadyInitialized(): Promise<boolean> {
    const count = await this.leagueRepo.count();
    return count > 0;
  }

  async generatePyramid(): Promise<void> {
    if (await this.isAlreadyInitialized()) {
      this.logger.log('[LeagueGenerator] Leagues already exist, skipping');
      return;
    }

    // L1: 1 league
    const l1 = await this.createLeague({
      name: '精英联赛',
      tier: 1,
      tierDivision: 1,
    });
    this.logger.log(`[LeagueGenerator] Created L1: 精英联赛`);

    // L2: 4 leagues, each parent is L1
    const l2Divisions = ['第1区', '第2区', '第3区', '第4区'];
    const l2Ids: string[] = [];
    for (let d = 1; d <= 4; d++) {
      const league = await this.createLeague({
        name: `职业联赛 ${l2Divisions[d - 1]}`,
        tier: 2,
        tierDivision: d,
        parentLeagueId: l1.id,
      });
      l2Ids.push(league.id);
    }
    this.logger.log(`[LeagueGenerator] Created L2: 4 divisions`);

    // L3: 16 leagues, grouped under L2 divisions
    const l3Ids: string[] = [];
    for (let d = 1; d <= 16; d++) {
      // L3 division d belongs to L2 division Math.ceil(d / 4)
      const l2Division = Math.ceil(d / 4);
      const league = await this.createLeague({
        name: `半职业联赛 第${d}区`,
        tier: 3,
        tierDivision: d,
        parentLeagueId: l2Ids[l2Division - 1],
      });
      l3Ids.push(league.id);
    }
    this.logger.log(`[LeagueGenerator] Created L3: 16 divisions`);

    // L4: 64 leagues, grouped under L3 divisions
    for (let d = 1; d <= 64; d++) {
      // L4 division d belongs to L3 division Math.ceil(d / 4)
      const l3Division = Math.ceil(d / 4);
      await this.createLeague({
        name: `业余联赛 第${d}区`,
        tier: 4,
        tierDivision: d,
        parentLeagueId: l3Ids[l3Division - 1],
      });
    }
    this.logger.log(`[LeagueGenerator] Created L4: 64 divisions`);

    this.logger.log('[LeagueGenerator] Pyramid complete: 85 leagues total');
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
