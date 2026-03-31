import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    TeamEntity,
    PlayerEntity,
    PotentialTier,
    TrainingSlot,
    TrainingCategory,
} from '@goalxi/database';

interface GeneratedTeam {
    team: Partial<TeamEntity>;
    players: any[];
}

/**
 * Team Generator Service
 *
 * 生成完整球队（16名球员）：
 * - GK: 2人
 * - 后卫: 5人
 * - 中场: 5人
 * - 前锋: 4人
 *
 * 球员属性根据联赛层级浮动，
 * 经理球队能力值相近，保证公平性
 */
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
        const players = this.generatePlayers(leagueTier, teamBaseOvr);

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

        this.logger.log(`Generated team "${savedTeam.name}" with ${players.length} players`);

        return savedTeam;
    }

    /**
     * 生成16名球员（能力值围绕基准，差距小）
     */
    private generatePlayers(leagueTier: number, teamBaseOvr: number): any[] {
        const players: any[] = [];

        for (const [position, count] of Object.entries(this.POSITION_REQUIREMENTS)) {
            for (let i = 0; i < count; i++) {
                // 每个球员的OVR在球队基准OVR附近浮动（±2）
                const playerOvr = teamBaseOvr + this.randomInRange(-2, 2);
                players.push(this.generatePlayer(position, leagueTier, playerOvr));
            }
        }

        return players;
    }

    /**
     * 生成单个球员
     */
    private generatePlayer(position: string, leagueTier: number, playerOvr: number): any {
        const age = this.generateAge();
        const ageFactor = age < 25 ? 0.85 : age > 32 ? 1.1 : 1.0;

        // 调整后的OVR（考虑年龄）
        const adjustedOvr = Math.round(playerOvr * ageFactor);

        // 技能值 = OVR / 5（OVR 40 = 技能 8）
        const skillBase = Math.max(1, Math.min(20, Math.round(adjustedOvr / 5)));

        const skills = this.generateSkills(position, skillBase);
        const potentialOvr = age < 23 ? Math.min(adjustedOvr + this.randomInRange(3, 8), 85) : adjustedOvr;

        return {
            name: this.generatePlayerName(),
            age,
            exactAge: [age, Math.floor(Math.random() * 12)],
            isGoalkeeper: position === 'GK',
            currentSkills: skills,
            potentialSkills: this.generatePotentialSkills(skills, potentialOvr - adjustedOvr),
            currentStamina: 3 + Math.random() * 2,
            form: 3 + Math.random() * 4,
            experience: this.generateExperience(age),
            potentialTier: this.determinePotentialTier(potentialOvr),
            appearance: this.randomInRange(50, 100),
            trainingSlot: TrainingSlot.REGULAR,
            trainingCategory: this.getTrainingCategory(position),
        };
    }

    /**
     * 生成技能（围绕基准值，差距小）
     */
    private generateSkills(position: string, skillBase: number): any {
        const variance = (range: number) => this.randomInRange(-range, range);
        const skill = (base: number, v: number) => Math.max(1, Math.min(20, base + v));

        const isGK = position === 'GK';
        const isDefender = ['CD', 'LB', 'RB'].includes(position);
        const isMidfielder = ['CM', 'DM', 'AM', 'LM', 'RM'].includes(position);
        const isForward = ['LW', 'RW', 'CF'].includes(position);

        if (isGK) {
            return {
                physical: {
                    pace: skill(skillBase, variance(2)),
                    strength: skill(skillBase, variance(2)),
                    stamina: skill(skillBase, variance(2)),
                    jumping: skill(skillBase, variance(2)),
                },
                goalkeeper: {
                    reflexes: skill(skillBase + 3, variance(1)),
                    handling: skill(skillBase + 2, variance(2)),
                    distribution: skill(skillBase - 3, variance(3)),
                    positioning: skill(skillBase + 1, variance(2)),
                },
                mental: {
                    positioning: skill(skillBase - 2, variance(2)),
                    composure: skill(skillBase - 3, variance(3)),
                },
                setPieces: {
                    freeKicks: skill(skillBase - 6, variance(2)),
                    penalties: skill(skillBase - 6, variance(2)),
                },
            };
        }

        return {
            physical: {
                pace: skill(isForward ? skillBase + 2 : isDefender ? skillBase - 1 : skillBase, variance(2)),
                strength: skill(isDefender ? skillBase + 2 : skillBase, variance(2)),
                stamina: skill(skillBase, variance(2)),
                jumping: skill(isDefender ? skillBase + 1 : skillBase - 1, variance(2)),
            },
            technical: {
                finishing: skill(isForward ? skillBase + 3 : skillBase - 4, variance(2)),
                passing: skill(isMidfielder ? skillBase + 2 : skillBase, variance(2)),
                dribbling: skill(isForward ? skillBase + 2 : skillBase - 1, variance(2)),
                defending: skill(isDefender ? skillBase + 2 : skillBase - 5, variance(2)),
            },
            mental: {
                positioning: skill(skillBase, variance(2)),
                composure: skill(skillBase - 1, variance(2)),
            },
            setPieces: {
                freeKicks: skill(skillBase - 3, variance(3)),
                penalties: skill(skillBase - 3, variance(3)),
            },
        };
    }

    /**
     * 生成潜力技能（小幅成长）
     */
    private generatePotentialSkills(currentSkills: any, growth: number): any {
        const grow = (val: number) => Math.min(20, Math.max(1, val + Math.round(growth / 5)));

        const addGrowth = (obj: Record<string, number>): Record<string, number> => {
            const result: Record<string, number> = {};
            for (const [k, v] of Object.entries(obj)) {
                result[k] = grow(v);
            }
            return result;
        };

        return {
            physical: addGrowth(currentSkills.physical),
            technical: addGrowth(currentSkills.technical || currentSkills.goalkeeper),
            mental: addGrowth(currentSkills.mental),
            setPieces: addGrowth(currentSkills.setPieces),
        };
    }

    /**
     * 生成年龄（集中于当打之年）
     */
    private generateAge(): number {
        const rand = Math.random();
        if (rand < 0.10) return this.randomInRange(17, 20);      // 10%: 潜力新星
        if (rand < 0.55) return this.randomInRange(21, 28);      // 45%: 当打之年
        if (rand < 0.80) return this.randomInRange(29, 32);      // 25%: 经验丰富
        return this.randomInRange(33, 35);                          // 15%: 老将
    }

    /**
     * 生成经验值
     */
    private generateExperience(age: number): number {
        if (age < 22) return this.randomInRange(0, 10);
        if (age < 26) return this.randomInRange(10, 40);
        if (age < 30) return this.randomInRange(40, 120);
        return this.randomInRange(120, 250);
    }

    /**
     * 确定潜力等级
     */
    private determinePotentialTier(potentialOvr: number): PotentialTier {
        // OVR 80+ = ELITE, 70+ = HIGH_PRO, 60+ = REGULAR, else LOW
        if (potentialOvr >= 16) return PotentialTier.ELITE;     // 技能 16+
        if (potentialOvr >= 14) return PotentialTier.HIGH_PRO;  // 技能 14+
        if (potentialOvr >= 12) return PotentialTier.REGULAR;   // 技能 12+
        return PotentialTier.LOW;
    }

    /**
     * 获取训练类别
     */
    private getTrainingCategory(position: string): TrainingCategory {
        if (['CD', 'LB', 'RB'].includes(position)) return TrainingCategory.PHYSICAL;
        if (['LW', 'RW', 'CF'].includes(position)) return TrainingCategory.TECHNICAL;
        if (['GK'].includes(position)) return TrainingCategory.GOALKEEPER;
        return TrainingCategory.MENTAL;
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
