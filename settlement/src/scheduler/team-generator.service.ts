import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TeamEntity,
  PlayerEntity,
  PotentialTier,
  StadiumEntity,
  FanEntity,
  StaffEntity,
  StaffRole,
  StaffLevel,
  getRandomNameByNationality,
  getRandomNationality,
} from '@goalxi/database';

type TemplateType = 'elite' | 'balanced' | 'rookie' | 'specialized';

interface GeneratedTeam {
  team: Partial<TeamEntity>;
  players: any[];
}

const TEMPLATE_SKILL_RANGES: Record<
  TemplateType,
  { base: number; variance: number }
> = {
  elite: { base: 14, variance: 2 },
  balanced: { base: 11, variance: 3 },
  rookie: { base: 7, variance: 2 },
  specialized: { base: 9, variance: 3 },
};

const POSITION_TEMPLATES: Record<
  string,
  Record<
    TemplateType,
    {
      primary: string[];
      secondary: string[];
      tertiary: string[];
      abilities?: string[];
    }
  >
> = {
  GK: {
    elite: {
      primary: ['gk_reflexes', 'gk_handling'],
      secondary: ['positioning', 'composure'],
      tertiary: ['passing', 'strength', 'pace'],
    },
    balanced: {
      primary: ['gk_reflexes', 'gk_handling'],
      secondary: ['positioning', 'composure', 'strength'],
      tertiary: ['passing', 'pace'],
    },
    rookie: {
      primary: ['gk_handling'],
      secondary: ['gk_reflexes', 'positioning'],
      tertiary: ['composure', 'strength', 'passing', 'pace'],
    },
    specialized: {
      primary: ['gk_handling'],
      secondary: ['gk_reflexes', 'positioning'],
      tertiary: ['composure', 'strength', 'passing'],
    },
  },
  CD: {
    elite: {
      primary: ['defending', 'strength', 'positioning'],
      secondary: ['pace', 'composure'],
      tertiary: ['passing', 'finishing', 'dribbling'],
      abilities: ['tackle_master'],
    },
    balanced: {
      primary: ['defending', 'strength'],
      secondary: ['positioning', 'pace'],
      tertiary: ['composure', 'passing'],
    },
    rookie: {
      primary: ['defending', 'strength'],
      secondary: ['positioning', 'pace'],
      tertiary: ['composure', 'passing'],
    },
    specialized: {
      primary: ['strength', 'positioning'],
      secondary: ['defending', 'pace'],
      tertiary: ['composure', 'passing'],
    },
  },
  LB: {
    elite: {
      primary: ['defending', 'pace', 'composure'],
      secondary: ['strength', 'positioning', 'passing'],
      tertiary: ['dribbling', 'finishing'],
      abilities: ['tackle_master'],
    },
    balanced: {
      primary: ['defending', 'pace'],
      secondary: ['strength', 'positioning'],
      tertiary: ['composure', 'passing'],
    },
    rookie: {
      primary: ['defending', 'pace'],
      secondary: ['strength', 'positioning'],
      tertiary: ['composure', 'passing'],
    },
    specialized: {
      primary: ['pace', 'passing'],
      secondary: ['dribbling', 'positioning'],
      tertiary: ['defending', 'strength'],
    },
  },
  RB: {
    elite: {
      primary: ['defending', 'pace', 'composure'],
      secondary: ['strength', 'positioning', 'passing'],
      tertiary: ['dribbling', 'finishing'],
      abilities: ['tackle_master'],
    },
    balanced: {
      primary: ['defending', 'pace'],
      secondary: ['strength', 'positioning'],
      tertiary: ['composure', 'passing'],
    },
    rookie: {
      primary: ['defending', 'pace'],
      secondary: ['strength', 'positioning'],
      tertiary: ['composure', 'passing'],
    },
    specialized: {
      primary: ['pace', 'passing'],
      secondary: ['dribbling', 'positioning'],
      tertiary: ['defending', 'strength'],
    },
  },
  DM: {
    elite: {
      primary: ['passing', 'defending', 'positioning'],
      secondary: ['composure', 'strength', 'pace'],
      tertiary: ['dribbling', 'finishing'],
      abilities: ['tackle_master', 'counter_starter'],
    },
    balanced: {
      primary: ['passing', 'defending'],
      secondary: ['positioning', 'strength'],
      tertiary: ['composure', 'pace'],
    },
    rookie: {
      primary: ['passing', 'defending'],
      secondary: ['positioning', 'strength'],
      tertiary: ['composure', 'pace'],
    },
    specialized: {
      primary: ['positioning', 'strength'],
      secondary: ['defending', 'pace'],
      tertiary: ['passing', 'composure'],
    },
  },
  CM: {
    elite: {
      primary: ['passing', 'dribbling', 'positioning'],
      secondary: ['defending', 'composure', 'pace'],
      tertiary: ['strength', 'finishing'],
      abilities: ['long_passer', 'counter_starter'],
    },
    balanced: {
      primary: ['passing', 'dribbling'],
      secondary: ['positioning', 'defending'],
      tertiary: ['composure', 'strength', 'pace'],
    },
    rookie: {
      primary: ['passing', 'dribbling'],
      secondary: ['positioning', 'defending'],
      tertiary: ['composure', 'strength', 'pace'],
    },
    specialized: {
      primary: ['passing'],
      secondary: ['positioning', 'composure'],
      tertiary: ['dribbling', 'defending', 'pace'],
    },
  },
  AM: {
    elite: {
      primary: ['passing', 'dribbling', 'finishing'],
      secondary: ['positioning', 'composure', 'pace'],
      tertiary: ['defending', 'strength'],
      abilities: ['long_passer', 'clutch_player'],
    },
    balanced: {
      primary: ['passing', 'dribbling'],
      secondary: ['finishing', 'positioning'],
      tertiary: ['composure', 'pace'],
    },
    rookie: {
      primary: ['passing', 'dribbling'],
      secondary: ['finishing', 'positioning'],
      tertiary: ['composure', 'pace'],
    },
    specialized: {
      primary: ['finishing', 'positioning'],
      secondary: ['pace', 'composure'],
      tertiary: ['passing', 'dribbling'],
    },
  },
  LW: {
    elite: {
      primary: ['pace', 'dribbling', 'passing'],
      secondary: ['finishing', 'positioning'],
      tertiary: ['strength', 'defending', 'composure'],
      abilities: ['dribble_master', 'cross_specialist', 'fast_start'],
    },
    balanced: {
      primary: ['pace', 'dribbling'],
      secondary: ['passing', 'finishing'],
      tertiary: ['positioning', 'strength'],
    },
    rookie: {
      primary: ['pace', 'dribbling'],
      secondary: ['passing', 'finishing'],
      tertiary: ['positioning', 'strength'],
    },
    specialized: {
      primary: ['pace', 'passing'],
      secondary: ['cross_specialist', 'positioning'],
      tertiary: ['dribbling', 'finishing'],
    },
  },
  RW: {
    elite: {
      primary: ['pace', 'dribbling', 'passing'],
      secondary: ['finishing', 'positioning'],
      tertiary: ['strength', 'defending', 'composure'],
      abilities: ['dribble_master', 'cross_specialist', 'fast_start'],
    },
    balanced: {
      primary: ['pace', 'dribbling'],
      secondary: ['passing', 'finishing'],
      tertiary: ['positioning', 'strength'],
    },
    rookie: {
      primary: ['pace', 'dribbling'],
      secondary: ['passing', 'finishing'],
      tertiary: ['positioning', 'strength'],
    },
    specialized: {
      primary: ['pace', 'passing'],
      secondary: ['cross_specialist', 'positioning'],
      tertiary: ['dribbling', 'finishing'],
    },
  },
  CF: {
    elite: {
      primary: ['finishing', 'positioning', 'strength'],
      secondary: ['pace', 'composure', 'dribbling'],
      tertiary: ['passing', 'defending'],
      abilities: ['clutch_player', 'rebound_specialist', 'header_specialist'],
    },
    balanced: {
      primary: ['finishing', 'positioning'],
      secondary: ['strength', 'pace'],
      tertiary: ['composure', 'dribbling', 'passing'],
    },
    rookie: {
      primary: ['finishing', 'positioning'],
      secondary: ['strength', 'pace'],
      tertiary: ['composure', 'dribbling', 'passing'],
    },
    specialized: {
      primary: ['positioning', 'strength'],
      secondary: ['finishing', 'pace'],
      tertiary: ['composure', 'dribbling'],
      abilities: ['header_specialist'],
    },
  },
};

@Injectable()
export class TeamGeneratorService {
  private readonly logger = new Logger(TeamGeneratorService.name);

  private readonly POSITION_REQUIREMENTS: Record<string, number> = {
    GK: 2,
    CD: 2,
    LB: 1,
    RB: 1,
    CM: 3,
    DM: 1,
    AM: 1,
    LW: 1,
    RW: 1,
    CF: 1,
  };

  private readonly TIER_OVR_RANGE: Record<
    number,
    { min: number; max: number }
  > = {
    1: { min: 55, max: 75 },
    2: { min: 45, max: 65 },
    3: { min: 35, max: 55 },
    4: { min: 30, max: 50 },
  };

  private readonly FIRST_NAMES = [
    'James',
    'John',
    'Marcus',
    'David',
    'Alex',
    'Michael',
    'Carlos',
    'Lucas',
    'Bruno',
    'Diego',
    'Fabio',
    'Marco',
    'Leo',
    'Rui',
    'Nuno',
    'Pedro',
    'Andre',
    'Luis',
    'Henrique',
    'Ricardo',
    'Sergio',
    'Oscar',
    'Ivan',
    'Milan',
    'Viktor',
    'Thomas',
    'Felix',
    'Jonas',
    'Emil',
    'Lars',
    'Erik',
    'Olaf',
    'Sven',
  ];

  private readonly LAST_NAMES = [
    'Silva',
    'Santos',
    'Rodriguez',
    'Martinez',
    'Fernandez',
    'Lopez',
    'Gonzalez',
    'Mueller',
    'Schmidt',
    'Weber',
    'Wagner',
    'Becker',
    'Hoffman',
    'Kruger',
    'Rossi',
    'Russo',
    'Ferrari',
    'Esposito',
    'Bianchi',
    'Romano',
    'Colombo',
    'Costa',
    'Sousa',
    'Pereira',
    'Almeida',
    'Nunes',
    'Campos',
    'Kim',
    'Park',
    'Lee',
    'Zhang',
    'Wang',
    'Li',
    'Chen',
    'Yang',
    'Huang',
  ];

  constructor(
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playerRepository: Repository<PlayerEntity>,
    @InjectRepository(StadiumEntity)
    private readonly stadiumRepository: Repository<StadiumEntity>,
    @InjectRepository(FanEntity)
    private readonly fanRepository: Repository<FanEntity>,
    @InjectRepository(StaffEntity)
    private readonly staffRepository: Repository<StaffEntity>,
  ) {}

  async generateTeam(
    leagueTier: number,
    teamName?: string,
    isBot = true,
    botLevel = 5,
  ): Promise<GeneratedTeam> {
    const ovrRange = this.TIER_OVR_RANGE[leagueTier] || this.TIER_OVR_RANGE[4];
    const name = teamName || this.generateTeamName(leagueTier);

    const teamBaseOvr = this.randomInRange(ovrRange.min, ovrRange.max);

    const players = this.generatePlayers(leagueTier, teamBaseOvr, isBot);

    const team: Partial<TeamEntity> = {
      name,
      isBot,
      botLevel: isBot ? botLevel : undefined,
      benchConfig: this.generateBenchConfig(),
    };

    return { team, players };
  }

  async createTeam(
    leagueTier: number,
    teamName?: string,
    isBot = true,
    botLevel = 5,
    userId?: string,
  ): Promise<TeamEntity> {
    const { team, players } = await this.generateTeam(
      leagueTier,
      teamName,
      isBot,
      botLevel,
    );

    const savedTeam = this.teamRepository.create({
      ...team,
      userId: userId || 'system',
    } as TeamEntity);
    await this.teamRepository.save(savedTeam);

    for (const player of players) {
      const savedPlayer = this.playerRepository.create({
        ...player,
        teamId: savedTeam.id,
      } as PlayerEntity);
      await this.playerRepository.save(savedPlayer);
    }

    await this.createDefaultStadiumAndFan(savedTeam.id, isBot);
    await this.createDefaultStaff(savedTeam.id);

    this.logger.log(
      `Generated team "${savedTeam.name}" with ${players.length} players`,
    );

    return savedTeam;
  }

  private async createDefaultStadiumAndFan(
    teamId: string,
    isBot: boolean,
  ): Promise<void> {
    const stadiumCapacity = 10000;

    const stadium = this.stadiumRepository.create({
      teamId,
      capacity: stadiumCapacity,
      isBuilt: true,
    });
    await this.stadiumRepository.save(stadium);

    // 初始球迷 5000 +/- 100
    const initialFans = 5000 + this.randomInRange(-100, 100);

    const fan = this.fanRepository.create({
      teamId,
      totalFans: initialFans,
      fanEmotion: 50,
      recentForm: '',
    });
    await this.fanRepository.save(fan);
  }

  /**
   * 创建默认 Level 2 主教练
   */
  private async createDefaultStaff(teamId: string): Promise<void> {
    const nationality = getRandomNationality();
    const { firstName, lastName } = getRandomNameByNationality(nationality);

    const headCoach = this.staffRepository.create({
      teamId,
      name: `${firstName} ${lastName}`,
      role: StaffRole.HEAD_COACH,
      level: StaffLevel.LEVEL_2,
      salary: 4000, // Level 2 周薪
      contractExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1年合同
      autoRenew: true,
      isActive: true,
      nationality,
    });
    await this.staffRepository.save(headCoach);
  }

  private generatePlayers(
    leagueTier: number,
    teamBaseOvr: number,
    isBot: boolean,
  ): any[] {
    const players: any[] = [];

    for (const [position, count] of Object.entries(
      this.POSITION_REQUIREMENTS,
    )) {
      for (let i = 0; i < count; i++) {
        const playerOvr = teamBaseOvr + this.randomInRange(-2, 2);
        players.push(
          this.generatePlayer(position, leagueTier, playerOvr, isBot),
        );
      }
    }

    const benchPositions = [
      'CD',
      'LB',
      'RB',
      'CM',
      'DM',
      'AM',
      'LW',
      'RW',
      'CF',
    ];
    for (let i = 0; i < 2; i++) {
      const pos =
        benchPositions[Math.floor(Math.random() * benchPositions.length)];
      const playerOvr = teamBaseOvr + this.randomInRange(-3, 3);
      players.push(this.generatePlayer(pos, leagueTier, playerOvr, isBot));
    }

    return players;
  }

  private generatePlayer(
    position: string,
    leagueTier: number,
    playerOvr: number,
    isBot: boolean,
  ): any {
    const age = this.generateAge();
    const ageFactor = age < 25 ? 0.85 : age > 32 ? 1.1 : 1.0;

    const adjustedOvr = Math.round(playerOvr * ageFactor);

    const skillBase = Math.max(1, Math.min(20, Math.round(adjustedOvr / 5)));

    const templateType = this.selectTemplateType(adjustedOvr);
    const skills = this.generateSkills(position, skillBase, templateType);

    const potentialOvr =
      age < 25
        ? Math.min(adjustedOvr + this.randomInRange(3, 10), 85)
        : age < 30
          ? Math.min(adjustedOvr + this.randomInRange(1, 5), 85)
          : adjustedOvr + this.randomInRange(0, 2);

    const potentialTier = this.determinePotentialTier(potentialOvr);

    const abilities = this.generateAbilities(
      position,
      templateType,
      potentialTier,
    );

    const potentialSkills = this.generatePotentialSkills(
      skills,
      potentialOvr - adjustedOvr,
    );

    const rand2dec = () => parseFloat((Math.random() * 5).toFixed(2));
    const exp2dec = () => parseFloat((Math.random() * 10).toFixed(2));

    return {
      name: this.generatePlayerName(),
      age,
      exactAge: [age, Math.floor(Math.random() * 12)],
      isGoalkeeper: position === 'GK',
      currentSkills: {
        ...skills,
        abilities: abilities.length > 0 ? abilities : undefined,
      },
      potentialSkills,
      currentStamina: rand2dec(),
      form: rand2dec(),
      experience: exp2dec(),
      potentialTier,
      abilities,
      appearance: this.randomInRange(50, 100),
    };
  }

  private selectTemplateType(ovr: number): TemplateType {
    if (ovr >= 70) return 'elite';
    if (ovr >= 55) return 'balanced';
    if (ovr >= 45) return 'specialized';
    return 'rookie';
  }

  private generateAbilities(
    position: string,
    templateType: TemplateType,
    potentialTier: PotentialTier,
  ): string[] {
    const template = POSITION_TEMPLATES[position];
    if (!template) return [];

    if (Math.random() > 0.3) return [];

    const possibleAbilities = template[templateType]?.abilities || [];
    if (possibleAbilities.length === 0) return [];

    const commonAbilities = [
      'tackle_master',
      'cross_specialist',
      'long_passer',
      'counter_starter',
      'fast_start',
    ];
    const eliteAbilities = [
      'clutch_player',
      'rebound_specialist',
      'header_specialist',
      'dribble_master',
    ];

    let availableAbilities = possibleAbilities.filter((a) =>
      commonAbilities.includes(a),
    );
    if (
      potentialTier === PotentialTier.ELITE ||
      potentialTier === PotentialTier.HIGH_PRO
    ) {
      availableAbilities = [
        ...availableAbilities,
        ...possibleAbilities.filter((a) => eliteAbilities.includes(a)),
      ];
    }

    if (availableAbilities.length === 0) return [];

    const pick =
      availableAbilities[Math.floor(Math.random() * availableAbilities.length)];
    return [pick];
  }

  private generateSkills(
    position: string,
    skillBase: number,
    templateType: TemplateType,
  ): any {
    const template = POSITION_TEMPLATES[position];
    const { base, variance } = TEMPLATE_SKILL_RANGES[templateType];

    const skill = (baseVal: number, boost: number, v: number) =>
      Math.max(1, Math.min(20, Math.round(baseVal + boost + v)));

    const randVariance = () => this.randomInRange(-variance, variance);

    if (position === 'GK') {
      return {
        physical: {
          pace: skill(base, -4, randVariance()),
          strength: skill(base, -2, randVariance()),
        },
        technical: {
          reflexes: skill(
            base,
            template?.elite?.primary?.includes('gk_reflexes')
              ? 3
              : template?.balanced?.primary?.includes('gk_reflexes')
                ? 2
                : 0,
            randVariance(),
          ),
          handling: skill(
            base,
            template?.elite?.primary?.includes('gk_handling')
              ? 3
              : template?.balanced?.primary?.includes('gk_handling')
                ? 2
                : 0,
            randVariance(),
          ),
          distribution: skill(base, -4, randVariance()),
        },
        mental: {
          positioning: skill(
            base,
            template?.elite?.secondary?.includes('positioning')
              ? 2
              : template?.balanced?.secondary?.includes('positioning')
                ? 1
                : -1,
            randVariance(),
          ),
          composure: skill(
            base,
            template?.elite?.secondary?.includes('composure')
              ? 2
              : template?.balanced?.secondary?.includes('composure')
                ? 1
                : -1,
            randVariance(),
          ),
        },
        setPieces: {
          freeKicks: skill(base, -6, randVariance()),
          penalties: skill(base, -6, randVariance()),
        },
      };
    }

    const isPrimary = (skillName: string) =>
      template?.[templateType]?.primary?.includes(skillName);
    const isSecondary = (skillName: string) =>
      template?.[templateType]?.secondary?.includes(skillName);

    const getBoost = (skillName: string) => {
      if (isPrimary(skillName)) return 3;
      if (isSecondary(skillName)) return 0;
      return -3;
    };

    return {
      physical: {
        pace: skill(base, getBoost('pace'), randVariance()),
        strength: skill(base, getBoost('strength'), randVariance()),
      },
      technical: {
        finishing: skill(base, getBoost('finishing'), randVariance()),
        passing: skill(base, getBoost('passing'), randVariance()),
        dribbling: skill(base, getBoost('dribbling'), randVariance()),
        defending: skill(base, getBoost('defending'), randVariance()),
      },
      mental: {
        positioning: skill(base, getBoost('positioning'), randVariance()),
        composure: skill(base, getBoost('composure'), randVariance()),
      },
      setPieces: {
        freeKicks: skill(base, -3, randVariance()),
        penalties: skill(base, -3, randVariance()),
      },
    };
  }

  private generatePotentialSkills(currentSkills: any, growth: number): any {
    const grow = (current: number, growthVal: number) => {
      const target = current + Math.round(growthVal / 5);
      return Math.max(current, Math.min(20, target));
    };

    const addGrowth = (
      currentObj: Record<string, number>,
      growthVal: number,
    ): Record<string, number> => {
      const result: Record<string, number> = {};
      for (const [k, v] of Object.entries(currentObj)) {
        result[k] = grow(v, growthVal);
      }
      return result;
    };

    return {
      physical: addGrowth(currentSkills.physical, growth),
      technical: addGrowth(currentSkills.technical, growth),
      mental: addGrowth(currentSkills.mental, growth),
      setPieces: addGrowth(currentSkills.setPieces, growth),
    };
  }

  private generateAge(): number {
    const rand = Math.random();
    if (rand < 0.25) return this.randomInRange(17, 21);
    if (rand < 0.7) return this.randomInRange(22, 26);
    if (rand < 0.9) return this.randomInRange(27, 30);
    return this.randomInRange(31, 32);
  }

  private determinePotentialTier(potentialOvr: number): PotentialTier {
    if (potentialOvr >= 80) return PotentialTier.ELITE;
    if (potentialOvr >= 70) return PotentialTier.HIGH_PRO;
    if (potentialOvr >= 60) return PotentialTier.REGULAR;
    return PotentialTier.LOW;
  }

  private generateTeamName(leagueTier: number): string {
    const prefixes = ['FC', 'SC', 'AC', 'United', 'City', 'Rovers', 'Athletic'];
    const cities = [
      'North',
      'South',
      'East',
      'West',
      'Central',
      'New',
      'Royal',
      'Grand',
    ];
    const names = [
      'Wolves',
      'Eagles',
      'Lions',
      'Tigers',
      'Bears',
      'Sharks',
      'Phoenix',
      'Dragons',
      'Warriors',
      'Knights',
    ];

    if (Math.random() < 0.3) {
      return `${cities[Math.floor(Math.random() * cities.length)]} ${names[Math.floor(Math.random() * names.length)]}`;
    }
    return `${names[Math.floor(Math.random() * names.length)]} ${prefixes[Math.floor(Math.random() * prefixes.length)]}`;
  }

  private generatePlayerName(): string {
    const first =
      this.FIRST_NAMES[Math.floor(Math.random() * this.FIRST_NAMES.length)];
    const last =
      this.LAST_NAMES[Math.floor(Math.random() * this.LAST_NAMES.length)];
    return `${first} ${last}`;
  }

  private generateBenchConfig(): any {
    return {
      goalkeeper: null,
      centerBack: null,
      fullback: null,
      winger: null,
      centralMidfield: null,
      forward: null,
    };
  }

  private randomInRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
