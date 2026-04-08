import { Uuid } from '../types/common.type';
import { AbstractEntity } from './abstract.entity';
import { TeamEntity } from './team.entity';
import {
    Column,
    DeleteDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { GAME_SETTINGS } from '../constants/game.constants';

export enum PotentialTier {
    LOW = 'LOW',
    REGULAR = 'REGULAR',
    HIGH_PRO = 'HIGH_PRO',
    ELITE = 'ELITE',
    LEGEND = 'LEGEND',
}

export enum TrainingSlot {
    ENHANCED = 'ENHANCED',
    REGULAR = 'REGULAR',
    NONE = 'NONE',
}

export enum TrainingCategory {
    PHYSICAL = 'physical',
    TECHNICAL = 'technical',
    MENTAL = 'mental',
    SET_PIECES = 'setPieces',
    GOALKEEPER = 'goalkeeper',
}

export interface OutfieldPhysical {
    pace: number;
    strength: number;
}
export interface OutfieldTechnical {
    finishing: number;
    passing: number;
    dribbling: number;
    defending: number;
}
export interface OutfieldMental {
    positioning: number;
    composure: number;
}

export interface GKTechnical {
    reflexes: number;
    handling: number;
    aerial: number;
    positioning: number;
}

export interface SetPiecesSkills {
    freeKicks: number;
    penalties: number;
}

export interface PlayerSkills {
    physical: OutfieldPhysical;
    technical: OutfieldTechnical | GKTechnical;
    mental: OutfieldMental;
    setPieces: SetPiecesSkills;
}


export interface CareerStats {
    club: {
        matches: number;
        goals: number;
        assists: number;
        tackles: number;
        yellowCards: number;
        redCards: number;
    };
    national?: {
        matches: number;
        goals: number;
        assists: number;
        tackles: number;
        yellowCards: number;
        redCards: number;
    };
}

@Entity('player')
export class PlayerEntity extends AbstractEntity {
    constructor(data?: Partial<PlayerEntity>) {
        super();
        Object.assign(this, data);
    }

    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_player_id' })
    id!: Uuid;

    @Column({ name: 'team_id', type: 'uuid', nullable: true })
    teamId?: string | null;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'team_id' })
    team?: TeamEntity;

    @Column()
    name!: string;

    @Column({ type: 'varchar', length: 2, nullable: true, comment: 'ISO 3166-1 alpha-2 country code (e.g., CN, US, GB, DE)' })
    nationality?: string;

    @Column({ type: 'date', nullable: true })
    birthday?: Date;

    @Column({ name: 'is_youth', default: false })
    isYouth!: boolean;

    get age(): number {
        if (!this.birthday) return 0;
        const diff = Date.now() - new Date(this.birthday).getTime();
        return Math.floor(diff / GAME_SETTINGS.MS_PER_YEAR);
    }

    /**
     * Returns exact age as a tuple [years, days]
     */
    getExactAge(): [number, number] {
        if (!this.birthday) return [0, 0];
        const now = new Date();
        const birthdayDate = new Date(this.birthday);
        const diffMs = now.getTime() - birthdayDate.getTime();
        const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const years = Math.floor(totalDays / GAME_SETTINGS.DAYS_PER_YEAR);
        const days = totalDays % GAME_SETTINGS.DAYS_PER_YEAR;
        return [years, days];
    }

    @Column({ type: 'jsonb', default: {} })
    appearance!: Record<string, any>;



    @Column({ name: 'is_goalkeeper', default: false })
    isGoalkeeper!: boolean;

    @Column({ name: 'on_transfer', default: false })
    onTransfer!: boolean;

    @Column({ name: 'current_skills', type: 'jsonb' })
    currentSkills!: PlayerSkills;

    @Column({ name: 'potential_skills', type: 'jsonb' })
    potentialSkills!: PlayerSkills;

    @Column({ name: 'potential_ability', type: 'int', default: 50 })
    potentialAbility!: number;

    @Column({
        name: 'potential_tier',
        type: 'enum',
        enum: PotentialTier,
        default: PotentialTier.LOW,
    })
    potentialTier!: PotentialTier;

    @Column({
        name: 'training_slot',
        type: 'enum',
        enum: TrainingSlot,
        default: TrainingSlot.REGULAR,
    })
    trainingSlot!: TrainingSlot;

    @Column({
        name: 'training_category',
        type: 'enum',
        enum: TrainingCategory,
        default: TrainingCategory.PHYSICAL,
    })
    trainingCategory!: TrainingCategory;

    @Column({
        name: 'training_skill',
        type: 'varchar',
        length: 20,
        nullable: true,
    })
    trainingSkill?: string | null;

    @Column({ type: 'float', default: 0.0 })
    experience!: number;

    @Column({ type: 'float', default: 3.0 })
    form!: number;

    /**
     * 累计比赛分钟数
     * 每场比赛后累加，状态更新后清零
     */
    @Column({ name: 'match_minutes', type: 'int', default: 0 })
    matchMinutes!: number;

    @Column({ type: 'float', default: 3.0 })
    stamina!: number;

    @Column({ name: 'current_wage', type: 'int', default: 2000 })
    currentWage!: number;

    @Column({ name: 'career_stats', type: 'jsonb', default: '{}' })
    careerStats!: CareerStats;

    @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
    deletedAt?: Date;

    // Injury fields
    @Column({ name: 'current_injury_value', type: 'int', default: 0 })
    currentInjuryValue!: number;

    @Column({ name: 'injury_type', type: 'varchar', length: 20, nullable: true })
    injuryType?: 'muscle' | 'ligament' | 'joint' | 'head' | 'other' | null;

    /** Injury state: 'severe' = cannot play, 'minor' = can play at 95% */
    @Column({ name: 'injury_state', type: 'varchar', length: 10, nullable: true })
    injuryState?: 'severe' | 'minor' | null;

    @Column({ name: 'injured_at', type: 'timestamptz', nullable: true })
    injuredAt?: Date | null;
}
