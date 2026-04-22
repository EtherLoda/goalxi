import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  TeamEntity,
  PlayerEntity,
  StaffEntity,
  StadiumEntity,
  FanEntity,
  FinanceEntity,
  LeagueStandingEntity,
  LeagueEntity,
  StaffRole,
  StaffLevel,
  PotentialTier,
  TrainingSlot,
  PlayerSkills,
  GKTechnical,
  OutfieldTechnical,
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

@Injectable()
export class TeamGenerator {
  private readonly logger = new Logger(TeamGenerator.name);

  private cityIndex = 0;

  constructor(
    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
    @InjectRepository(PlayerEntity)
    private playerRepo: Repository<PlayerEntity>,
    @InjectRepository(StaffEntity)
    private staffRepo: Repository<StaffEntity>,
    @InjectRepository(StadiumEntity)
    private stadiumRepo: Repository<StadiumEntity>,
    @InjectRepository(FanEntity)
    private fanRepo: Repository<FanEntity>,
    @InjectRepository(FinanceEntity)
    private financeRepo: Repository<FinanceEntity>,
    @InjectRepository(LeagueStandingEntity)
    private standingRepo: Repository<LeagueStandingEntity>,
    @InjectRepository(LeagueEntity)
    private leagueRepo: Repository<LeagueEntity>,
  ) {}

  async generateAllTeams(botUserId: string): Promise<void> {
    const count = await this.teamRepo.count();
    if (count > 0) {
      this.logger.log(`[TeamGenerator] ${count} teams already exist, skipping`);
      return;
    }

    const leagues = await this.leagueRepo.find();
    this.logger.log(
      `[TeamGenerator] Generating teams for ${leagues.length} leagues...`,
    );

    let teamCount = 0;

    for (const league of leagues) {
      for (let i = 0; i < league.maxTeams; i++) {
        const teamName = this.generateTeamName(league.tier, teamCount);
        await this.createTeam(league, teamName, botUserId);
        teamCount++;
      }
    }

    this.logger.log(`[TeamGenerator] Created ${teamCount} teams`);
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

  private async createTeam(
    league: LeagueEntity,
    teamName: string,
    botUserId: string,
  ): Promise<void> {
    // Create team - let TypeORM auto-generate UUID
    const team = this.teamRepo.create({
      name: teamName,
      leagueId: league.id,
      userId: botUserId,
      isBot: true,
      botLevel: 5,
      nationality: 'CN',
      benchConfig: null,
    });
    const savedTeam = await this.teamRepo.save(team);
    const teamId = savedTeam.id;

    // Create 16 players
    await this.createPlayers(teamId);

    // Create 1 HEAD_COACH
    await this.createHeadCoach(teamId);

    // Create Stadium
    await this.stadiumRepo.save(
      this.stadiumRepo.create({
        teamId,
        capacity: 10000,
        isBuilt: true,
      }),
    );

    // Create Fan
    await this.fanRepo.save(
      this.fanRepo.create({
        teamId,
        totalFans: 5000,
        fanEmotion: 50,
        recentForm: '',
      }),
    );

    // Create Finance
    await this.financeRepo.save(
      this.financeRepo.create({
        teamId,
        balance: 5000000,
      }),
    );

    // Create LeagueStanding
    await this.standingRepo.save(
      this.standingRepo.create({
        teamId,
        leagueId: league.id,
        season: 1,
        position: 0,
        played: 0,
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        recentForm: '',
      }),
    );
  }

  private async createPlayers(teamId: string): Promise<void> {
    const players: PlayerEntity[] = [];

    // 2 GK + 14 outfield = 16 total
    for (let i = 0; i < 16; i++) {
      const isGK = i < 2;
      const nationality = 'CN';
      const { firstName, lastName } = this.getRandomChineseName();
      const name = `${firstName}${lastName}`;
      const age = this.randomInt(20, 28);

      const { current, potential } = this.generatePlayerSkills(isGK, age);

      // Calculate wage
      const skillValues = this.getSkillValues(current, isGK);
      const skillKeys = this.getSkillKeys(isGK);
      const wage = this.calculatePlayerWage(skillValues, skillKeys);

      players.push(
        this.playerRepo.create({
          name,
          teamId,
          isGoalkeeper: isGK,
          nationality,
          birthday: this.generateBirthday(age),
          isYouth: false,
          currentSkills: current,
          potentialSkills: potential,
          potentialAbility: Math.round(this.calculateOvr(potential)),
          potentialTier: this.determinePotentialTier(potential),
          trainingSlot: TrainingSlot.NONE,
          experience: this.randomFloat(5, 15),
          form: this.randomFloat(3, 5),
          stamina: this.randomFloat(4, 5),
          currentWage: wage,
        }),
      );
    }

    await this.playerRepo.save(players);
  }

  private async createHeadCoach(teamId: string): Promise<void> {
    const { firstName, lastName } = this.getRandomChineseName();
    await this.staffRepo.save(
      this.staffRepo.create({
        teamId,
        name: `${firstName}${lastName}`,
        role: StaffRole.HEAD_COACH,
        level: StaffLevel.LEVEL_2,
        salary: 4000,
        contractExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        autoRenew: true,
        isActive: true,
        nationality: 'CN',
      }),
    );
  }

  private generatePlayerSkills(
    isGK: boolean,
    age: number,
  ): { current: PlayerSkills; potential: PlayerSkills } {
    const skillBase = this.randomInt(11, 15); // 11-15 OVR per skill (55-75 overall)

    const current = this.generateSkillsForAge(skillBase, age, isGK);
    const potential = this.generateSkillsForAge(
      skillBase + this.randomInt(3, 8),
      age + 2,
      isGK,
    );

    return { current, potential };
  }

  private generateSkillsForAge(
    baseOvr: number,
    age: number,
    isGK: boolean,
  ): PlayerSkills {
    const skillValue = Math.round(baseOvr / 5);
    const variance = () => Math.random() * 2 - 1;

    if (isGK) {
      return {
        physical: {
          pace: Math.max(1, Math.min(20, skillValue + variance())),
          strength: Math.max(1, Math.min(20, skillValue + variance())),
        },
        technical: {
          reflexes: Math.max(1, Math.min(20, skillValue + 2 + variance())),
          handling: Math.max(1, Math.min(20, skillValue + 2 + variance())),
          aerial: Math.max(1, Math.min(20, skillValue + variance())),
          positioning: Math.max(1, Math.min(20, skillValue + variance())),
        } as GKTechnical,
        mental: {
          positioning: Math.max(1, Math.min(20, skillValue + variance())),
          composure: Math.max(1, Math.min(20, skillValue + variance())),
        },
        setPieces: {
          freeKicks: Math.max(1, Math.min(20, skillValue - 2 + variance())),
          penalties: Math.max(1, Math.min(20, skillValue - 2 + variance())),
        },
      };
    }

    return {
      physical: {
        pace: Math.max(1, Math.min(20, skillValue + variance())),
        strength: Math.max(1, Math.min(20, skillValue + variance())),
      },
      technical: {
        finishing: Math.max(1, Math.min(20, skillValue + 2 + variance())),
        passing: Math.max(1, Math.min(20, skillValue + variance())),
        dribbling: Math.max(1, Math.min(20, skillValue + variance())),
        defending: Math.max(1, Math.min(20, skillValue - 1 + variance())),
      } as OutfieldTechnical,
      mental: {
        positioning: Math.max(1, Math.min(20, skillValue + variance())),
        composure: Math.max(1, Math.min(20, skillValue + variance())),
      },
      setPieces: {
        freeKicks: Math.max(1, Math.min(20, skillValue - 2 + variance())),
        penalties: Math.max(1, Math.min(20, skillValue - 2 + variance())),
      },
    };
  }

  private calculateOvr(skills: PlayerSkills): number {
    const tech = skills.technical as unknown as Record<string, number>;
    const vals = Object.values(tech);
    return (vals.reduce((a, b) => a + b, 0) / vals.length) * 5;
  }

  private determinePotentialTier(skills: PlayerSkills): PotentialTier {
    const ovr = this.calculateOvr(skills);
    if (ovr >= 85) return PotentialTier.LEGEND;
    if (ovr >= 75) return PotentialTier.ELITE;
    if (ovr >= 65) return PotentialTier.HIGH_PRO;
    if (ovr >= 50) return PotentialTier.REGULAR;
    return PotentialTier.LOW;
  }

  private getSkillValues(skills: PlayerSkills, isGK: boolean): number[] {
    const tech = skills.technical as unknown as Record<string, number>;
    if (isGK) {
      return [
        tech.reflexes,
        tech.handling,
        tech.aerial,
        skills.mental.positioning,
      ];
    }
    return [
      skills.physical.pace,
      skills.physical.strength,
      tech.finishing,
      tech.passing,
      tech.dribbling,
      tech.defending,
      skills.mental.positioning,
      skills.mental.composure,
    ];
  }

  private getSkillKeys(isGK: boolean): string[] {
    if (isGK) {
      return ['gk_reflexes', 'gk_handling', 'gk_aerial', 'gk_positioning'];
    }
    return [
      'pace',
      'strength',
      'finishing',
      'passing',
      'dribbling',
      'defending',
      'positioning',
      'composure',
    ];
  }

  private calculatePlayerWage(
    skillValues: number[],
    skillKeys: string[],
  ): number {
    const { calculatePlayerWage: calcWage } = require('@goalxi/database');
    return calcWage(skillValues, skillKeys);
  }

  private generateBirthday(age: number): Date {
    const now = Date.now();
    const yearsAgo = age * 365 * 24 * 60 * 60 * 1000;
    const daysVariation = Math.floor(Math.random() * 365) * 24 * 60 * 60 * 1000;
    return new Date(now - yearsAgo - daysVariation);
  }

  private getRandomChineseName(): { firstName: string; lastName: string } {
    const firstNames = [
      '伟',
      '明',
      '军',
      '强',
      '磊',
      '涛',
      '勇',
      '杰',
      '鹏',
      '飞',
      '超',
      '波',
      '华',
      '凯',
      '旋',
      '颖',
      '宇',
      '晨',
      '浩',
      '文',
      '龙',
      '志',
      '海',
      '彬',
      '峰',
      '霖',
      '洋',
      '博',
      '昊',
      '然',
    ];
    const lastNames = [
      '伟',
      '芳',
      '刚',
      '强',
      '林',
      '敏',
      '静',
      '丽',
      '辉',
      '鹏',
      '杰',
      '涛',
      '勇',
      '飞',
      '超',
      '华',
      '凯',
      '旋',
      '颖',
      '宇',
    ];
    return {
      firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
      lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
    };
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private randomFloat(min: number, max: number): number {
    return parseFloat((Math.random() * (max - min) + min).toFixed(2));
  }
}
