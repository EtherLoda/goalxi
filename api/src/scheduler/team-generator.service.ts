import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    TeamEntity,
    PlayerEntity,
    PotentialTier,
    TrainingSlot,
    StadiumEntity,
    FanEntity,
} from '@goalxi/database';

/**
 * Position template types based on engine position-weights.ts analysis
 */
type TemplateType = 'elite' | 'balanced' | 'rookie' | 'specialized';

interface GeneratedTeam {
    team: Partial<TeamEntity>;
    players: any[];
}

// Skill ranges per template type
const TEMPLATE_SKILL_RANGES: Record<TemplateType, { base: number; variance: number }> = {
    elite: { base: 14, variance: 2 },      // Skills 12-16, OVR 70+
    balanced: { base: 11, variance: 3 },   // Skills 8-14, OVR 55-69
    rookie: { base: 7, variance: 2 },       // Skills 5-9, OVR ~35
    specialized: { base: 9, variance: 3 },  // Skills 6-12, OVR ~45
};

/**
 * Position-specific skill templates aligned with engine position-weights.ts
 *
 * GK: gk_reflexes (4.0), gk_handling (2.5), positioning (2.0), composure (1.5)
 * CB/CD: defending (1.0), strength (0.8), positioning (0.9), pace (0.5)
 * LB/RB: defending (1.0), pace (0.7), strength (0.6), positioning (0.9), composure (0.8)
 * DM: defending (0.7), positioning (0.5), passing (0.9), composure (0.25)
 * CM: passing (0.9), dribbling (0.8), positioning (0.4), defending (0.5)
 * AM: passing (0.7), dribbling (0.5), finishing (0.4)
 * LW/RW: pace (1.0), dribbling (0.9), passing (0.6), finishing (0.4)
 * CF: finishing (1.0), positioning (0.9), strength (0.65), pace (0.55)
 */
const POSITION_TEMPLATES: Record<string, Record<TemplateType, {
    primary: string[];   // High weight skills (base + 3)
    secondary: string[]; // Medium weight skills (base)
    tertiary: string[];  // Low weight skills (base - 3)
    abilities?: string[]; // Possible special abilities for this template
}>> = {
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
    // Center Defenders - defending (1.0), strength (0.8), positioning (0.9)
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
    // Fullbacks - defending (1.0), pace (0.7), strength (0.6), composure (0.8)
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
    // Defensive Midfielder - defending (0.7), positioning (0.5), passing (0.9)
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
    // Central Midfielder - passing (0.9), dribbling (0.8), positioning (0.4), defending (0.5)
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
    // Attacking Midfielder - passing (0.7), dribbling (0.5), finishing (0.4)
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
    // Left Winger - pace (1.0), dribbling (0.9), passing (0.6), finishing (0.4)
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
    // Right Winger - pace (1.0), dribbling (0.9), passing (0.6), finishing (0.4)
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
    // Center Forward - finishing (1.0), positioning (0.9), strength (0.65), pace (0.55)
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

    // 位置需求数量
    private readonly POSITION_REQUIREMENTS: Record<string, number> = {
        GK: 2, CD: 2, LB: 1, RB: 1,
        CM: 3, DM: 1, AM: 1,
        LW: 1, RW: 1, CF: 1,
    };

    // 联赛层级对应能力范围（技能最大值约20，对应OVR约40-80）
    // OVR 40 = 技能值 8
    private readonly TIER_OVR_RANGE: Record<number, { min: number; max: number }> = {
        1: { min: 55, max: 75 },   // L1 顶级：技能 11-15
        2: { min: 45, max: 65 },   // L2 二级：技能 9-13
        3: { min: 35, max: 55 },   // L3 三级：技能 7-11
        4: { min: 30, max: 50 },   // L4 末级：技能 6-10
    };

    // 名字库
    private readonly FIRST_NAMES = [
        'James', 'John', 'Marcus', 'David', 'Alex', 'Michael', 'Carlos', 'Lucas',
        'Bruno', 'Diego', 'Fabio', 'Marco', 'Leo', 'Rui', 'Nuno', 'Pedro', 'Andre',
        'Luis', 'Henrique', 'Ricardo', 'Sergio', 'Oscar', 'Ivan', 'Milan', 'Viktor',
        'Thomas', 'Felix', 'Jonas', 'Emil', 'Lars', 'Erik', 'Olaf', 'Sven',
    ];

    private readonly LAST_NAMES = [
        'Silva', 'Santos', 'Rodriguez', 'Martinez', 'Fernandez', 'Lopez', 'Gonzalez',
        'Mueller', 'Schmidt', 'Weber', 'Wagner', 'Becker', 'Hoffman', 'Kruger',
        'Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo',
        'Costa', 'Sousa', 'Pereira', 'Almeida', 'Nunes', 'Campos',
        'Kim', 'Park', 'Lee', 'Zhang', 'Wang', 'Li', 'Chen', 'Yang', 'Huang',
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
    ) {}

    /**
     * 生成完整球队
     */
    async generateTeam(leagueTier: number, teamName?: string, isBot = true, botLevel = 5): Promise<GeneratedTeam> {
        const ovrRange = this.TIER_OVR_RANGE[leagueTier] || this.TIER_OVR_RANGE[4];
        const name = teamName || this.generateTeamName(leagueTier);

        // 确定球队基准OVR（经理球队差距小）
        const teamBaseOvr = this.randomInRange(ovrRange.min, ovrRange.max);

        // 生成16名球员（围绕基准OVR，差距小）
        const players = this.generatePlayers(leagueTier, teamBaseOvr, isBot);

        const team: Partial<TeamEntity> = {
            name,
            isBot,
            botLevel: isBot ? botLevel : undefined,
            benchConfig: this.generateBenchConfig(),
        };

        return { team, players };
    }

    /**
     * 生成并保存球队
     */
    async createTeam(leagueTier: number, teamName?: string, isBot = true, botLevel = 5, userId?: string): Promise<TeamEntity> {
        const { team, players } = await this.generateTeam(leagueTier, teamName, isBot, botLevel);

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

        // Create default stadium and fan records
        await this.createDefaultStadiumAndFan(savedTeam.id, isBot);

        this.logger.log(`Generated team "${savedTeam.name}" with ${players.length} players`);

        return savedTeam;
    }

    /**
     * 创建默认球场和球迷记录
     */
    private async createDefaultStadiumAndFan(teamId: string, isBot: boolean): Promise<void> {
        // 所有球队默认10000容量球场
        const stadiumCapacity = 10000;

        const stadium = this.stadiumRepository.create({
            teamId,
            capacity: stadiumCapacity,
            isBuilt: true,
        });
        await this.stadiumRepository.save(stadium);

        // 初始球迷
        const initialFans = 10000;

        const fan = this.fanRepository.create({
            teamId,
            totalFans: initialFans,
            fanMorale: 50,
            recentForm: '',
        });
        await this.fanRepository.save(fan);
    }

    /**
     * 生成16名球员（围绕基准OVR，差距小）
     */
    private generatePlayers(leagueTier: number, teamBaseOvr: number, isBot: boolean): any[] {
        const players: any[] = [];

        for (const [position, count] of Object.entries(this.POSITION_REQUIREMENTS)) {
            for (let i = 0; i < count; i++) {
                // 每个球员的OVR在球队基准OVR附近浮动（±2）
                const playerOvr = teamBaseOvr + this.randomInRange(-2, 2);
                players.push(this.generatePlayer(position, leagueTier, playerOvr, isBot));
            }
        }

        // 添加2名替补（随机位置，非门将）
        const benchPositions = ['CD', 'LB', 'RB', 'CM', 'DM', 'AM', 'LW', 'RW', 'CF'];
        for (let i = 0; i < 2; i++) {
            const pos = benchPositions[Math.floor(Math.random() * benchPositions.length)];
            const playerOvr = teamBaseOvr + this.randomInRange(-3, 3);
            players.push(this.generatePlayer(pos, leagueTier, playerOvr, isBot));
        }

        return players;
    }

    /**
     * 生成单个球员
     */
    private generatePlayer(position: string, leagueTier: number, playerOvr: number, isBot: boolean): any {
        const age = this.generateAge();
        const ageFactor = age < 25 ? 0.85 : age > 32 ? 1.1 : 1.0;

        // 调整后的OVR（考虑年龄）
        const adjustedOvr = Math.round(playerOvr * ageFactor);

        // 技能值 = OVR / 5（OVR 40 = 技能 8）
        const skillBase = Math.max(1, Math.min(20, Math.round(adjustedOvr / 5)));

        // Choose template type based on player OVR
        const templateType = this.selectTemplateType(adjustedOvr);
        const skills = this.generateSkills(position, skillBase, templateType);

        // 潜力OVR：年轻球员有成长空间，年长球员保持或略高
        const potentialOvr = age < 25
            ? Math.min(adjustedOvr + this.randomInRange(3, 10), 85)
            : age < 30
                ? Math.min(adjustedOvr + this.randomInRange(1, 5), 85)
                : adjustedOvr + this.randomInRange(0, 2);

        // Determine potential tier based on potential OVR
        const potentialTier = this.determinePotentialTier(potentialOvr);

        // Determine if player gets a special ability (30% chance)
        const abilities = this.generateAbilities(position, templateType, potentialTier);

        // 生成潜力技能（必须 >= 当前技能）
        const potentialSkills = this.generatePotentialSkills(skills, potentialOvr - adjustedOvr);

        // 保留2位小数
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
            // stamina 0-5, form 0-5, experience 0-10，保留2位小数
            currentStamina: rand2dec(),
            form: rand2dec(),
            experience: exp2dec(),
            potentialTier,
            abilities,
            appearance: this.randomInRange(50, 100),
            // 生成的球队（BOT和经理）都不安排训练
            trainingSlot: TrainingSlot.NONE,
        };
    }

    /**
     * Select template type based on OVR
     */
    private selectTemplateType(ovr: number): TemplateType {
        if (ovr >= 70) return 'elite';       // 技能 14+
        if (ovr >= 55) return 'balanced';   // 技能 11-13
        if (ovr >= 45) return 'specialized'; // 技能 9 - 有一技之长
        return 'rookie';                      // 技能 7 - 新手球员
    }

    /**
     * Generate special abilities based on template and potential
     * All templates have 30% chance
     */
    private generateAbilities(position: string, templateType: TemplateType, potentialTier: PotentialTier): string[] {
        const template = POSITION_TEMPLATES[position];
        if (!template) return [];

        // 30% chance for elite, balanced, specialized
        if (Math.random() > 0.30) return [];

        // Only high potential players can have rare abilities
        const possibleAbilities = template[templateType]?.abilities || [];
        if (possibleAbilities.length === 0) return [];

        // Filter by potential tier (ELITE can have any, HIGH_PRO only common abilities)
        const commonAbilities = ['tackle_master', 'cross_specialist', 'long_passer', 'counter_starter', 'fast_start'];
        const eliteAbilities = ['clutch_player', 'rebound_specialist', 'header_specialist', 'dribble_master'];

        let availableAbilities = possibleAbilities.filter(a => commonAbilities.includes(a));
        if (potentialTier === PotentialTier.ELITE || potentialTier === PotentialTier.HIGH_PRO) {
            availableAbilities = [...availableAbilities, ...possibleAbilities.filter(a => eliteAbilities.includes(a))];
        }

        if (availableAbilities.length === 0) return [];

        // Pick one ability
        const pick = availableAbilities[Math.floor(Math.random() * availableAbilities.length)];
        return [pick];
    }

    /**
     * Generate skills using position templates with engine-aligned weights
     */
    private generateSkills(position: string, skillBase: number, templateType: TemplateType): any {
        const template = POSITION_TEMPLATES[position];
        const { base, variance } = TEMPLATE_SKILL_RANGES[templateType];

        const skill = (baseVal: number, boost: number, v: number) =>
            Math.max(1, Math.min(20, Math.round(baseVal + boost + v)));

        const randVariance = () => this.randomInRange(-variance, variance);

        // GK has special structure
        if (position === 'GK') {
            return {
                physical: {
                    pace: skill(base, -4, randVariance()),
                    strength: skill(base, -2, randVariance()),
                },
                technical: {
                    reflexes: skill(base, template?.elite?.primary?.includes('gk_reflexes') ? 3 :
                                   template?.balanced?.primary?.includes('gk_reflexes') ? 2 : 0, randVariance()),
                    handling: skill(base, template?.elite?.primary?.includes('gk_handling') ? 3 :
                                    template?.balanced?.primary?.includes('gk_handling') ? 2 : 0, randVariance()),
                    distribution: skill(base, -4, randVariance()),
                },
                mental: {
                    positioning: skill(base, template?.elite?.secondary?.includes('positioning') ? 2 :
                                       template?.balanced?.secondary?.includes('positioning') ? 1 : -1, randVariance()),
                    composure: skill(base, template?.elite?.secondary?.includes('composure') ? 2 :
                                      template?.balanced?.secondary?.includes('composure') ? 1 : -1, randVariance()),
                },
                setPieces: {
                    freeKicks: skill(base, -6, randVariance()),
                    penalties: skill(base, -6, randVariance()),
                },
            };
        }

        // Field players
        const isPrimary = (skillName: string) => template?.[templateType]?.primary?.includes(skillName);
        const isSecondary = (skillName: string) => template?.[templateType]?.secondary?.includes(skillName);

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

    /**
     * 生成潜力技能（必须 >= 当前技能）
     */
    private generatePotentialSkills(currentSkills: any, growth: number): any {
        // growth > 0 表示潜力高于当前，否则等于当前
        const grow = (current: number, growthVal: number) => {
            const target = current + Math.round(growthVal / 5);
            return Math.max(current, Math.min(20, target)); // 确保 >= current
        };

        const addGrowth = (currentObj: Record<string, number>, growthVal: number): Record<string, number> => {
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

    /**
     * Generate age (younger distribution for new managers/low level teams)
     */
    private generateAge(): number {
        const rand = Math.random();
        if (rand < 0.25) return this.randomInRange(17, 21);     // 25%: 潜力新星
        if (rand < 0.70) return this.randomInRange(22, 26);     // 45%: 当打之年
        if (rand < 0.90) return this.randomInRange(27, 30);     // 20%: 经验丰富
        return this.randomInRange(31, 32);                        // 10%: 老将
    }

    /**
     * 确定潜力等级 - OVR based (OVR = skillAvg * 5)
     */
    private determinePotentialTier(potentialOvr: number): PotentialTier {
        if (potentialOvr >= 80) return PotentialTier.ELITE;     // 技能 16+
        if (potentialOvr >= 70) return PotentialTier.HIGH_PRO;   // 技能 14+
        if (potentialOvr >= 60) return PotentialTier.REGULAR;   // 技能 12+
        return PotentialTier.LOW;
    }

    /**
     * 生成队名
     */
    private generateTeamName(leagueTier: number): string {
        const prefixes = ['FC', 'SC', 'AC', 'United', 'City', 'Rovers', 'Athletic'];
        const cities = ['North', 'South', 'East', 'West', 'Central', 'New', 'Royal', 'Grand'];
        const names = ['Wolves', 'Eagles', 'Lions', 'Tigers', 'Bears', 'Sharks', 'Phoenix', 'Dragons', 'Warriors', 'Knights'];

        if (Math.random() < 0.3) {
            return `${cities[Math.floor(Math.random() * cities.length)]} ${names[Math.floor(Math.random() * names.length)]}`;
        }
        return `${names[Math.floor(Math.random() * names.length)]} ${prefixes[Math.floor(Math.random() * prefixes.length)]}`;
    }

    /**
     * 生成球员名字
     */
    private generatePlayerName(): string {
        const first = this.FIRST_NAMES[Math.floor(Math.random() * this.FIRST_NAMES.length)];
        const last = this.LAST_NAMES[Math.floor(Math.random() * this.LAST_NAMES.length)];
        return `${first} ${last}`;
    }

    /**
     * 生成替补配置
     */
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
