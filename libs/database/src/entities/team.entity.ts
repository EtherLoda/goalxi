import { Uuid } from '../types/common.type';
import { AbstractEntity } from './abstract.entity';
import { UserEntity } from './user.entity';
import { LeagueEntity } from './league.entity';
import type { FinanceEntity } from './finance.entity';
import type { MatchEntity } from './match.entity';
import type { SeasonResultEntity } from './season-result.entity';
import { Column, DeleteDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Bench configuration for team substitutions
 * Each position group has substitute players mapped by player ID
 * FB = Fullback (covers both LB/RB), W = Winger (covers both LW/RW)
 */
export interface BenchConfig {
    goalkeeper: string | null;              // GK 替补
    centerBack: string | null;              // CD 替补
    fullback: string | null;                // FB 替补 (合并 LB/RB)
    winger: string | null;                  // W 替补 (合并 LW/RW)
    centralMidfield: string | null;         // AM/CM/DM 中场替补
    forward: string | null;                 // FWD/CF 前锋替补
}

@Entity('team')
export class TeamEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_team_id' })
    id!: Uuid;

    @Column({ name: 'user_id', type: 'uuid', nullable: true })
    userId: string | null;

    @ManyToOne(() => UserEntity)
    @JoinColumn({ name: 'user_id' })
    user: UserEntity;

    @OneToOne('FinanceEntity', (finance: any) => finance.team)
    finance: FinanceEntity;

    @Column({ name: 'league_id', type: 'uuid', nullable: true })
    leagueId: string | null;

    @ManyToOne(() => LeagueEntity)
    @JoinColumn({ name: 'league_id' })
    league: LeagueEntity;

    @Column({ type: 'varchar', nullable: false })
    name: string;

    @Column({ type: 'varchar', length: 2, nullable: true, comment: 'ISO 3166-1 alpha-2 country code (e.g., CN, US, GB, DE)' })
    nationality?: string;

    @Column({ name: 'logo_url', type: 'varchar', default: '' })
    logoUrl: string;

    @Column({ name: 'jersey_color_primary', type: 'varchar', default: '#FF0000' })
    jerseyColorPrimary: string;

    @Column({ name: 'jersey_color_secondary', type: 'varchar', default: '#FFFFFF' })
    jerseyColorSecondary: string;

    @Column({ name: 'bench_config', type: 'jsonb', nullable: true, comment: 'Bench configuration for substitutions' })
    benchConfig: BenchConfig | null;

    /** 是否为 BOT 球队 */
    @Column({ name: 'is_bot', type: 'boolean', default: true })
    isBot: boolean;

    /** BOT 强度等级 (1-10)，仅 isBot=true 时有效 */
    @Column({ name: 'bot_level', type: 'int', default: 5 })
    botLevel: number;

    /** 体能训练强度 (0-1)，每周用于体能恢复的比例，默认10% */
    @Column({ name: 'stamina_training_intensity', type: 'float', default: 0.1 })
    staminaTrainingIntensity: number;

    /** ELO 评分（隐藏），用于计算比赛预期和球迷士气 */
    @Column({ name: 'elo_rating', type: 'int', default: 1500 })
    eloRating: number;

    @OneToMany('MatchEntity', (match: MatchEntity) => match.homeTeam)
    homeMatches: MatchEntity[];

    @OneToMany('MatchEntity', (match: MatchEntity) => match.awayTeam)
    awayMatches: MatchEntity[];

    @OneToMany('SeasonResultEntity', (result: SeasonResultEntity) => result.team)
    seasonResults: SeasonResultEntity[];

    /** 已锁定金额（所有待成交出价之和） */
    @Column({ name: 'locked_cash', type: 'integer', default: 0 })
    lockedCash!: number;

    @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
    deletedAt: Date | null;

    constructor(data?: Partial<TeamEntity>) {
        super();
        Object.assign(this, data);
    }
}
