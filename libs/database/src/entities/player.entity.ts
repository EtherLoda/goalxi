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
    GENIUS = 'GENIUS',
    REGULAR = 'REGULAR',
    NONE = 'NONE',
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
    distribution: number;
}

export interface PlayerSkills {
    physical: OutfieldPhysical;
    technical: OutfieldTechnical | GKTechnical;
    mental: OutfieldMental;
}


export interface CareerStats {
    club: {
        matches: number;
        goals: number;
        assists: number;
        yellowCards: number;
        redCards: number;
    };
    national?: {
        matches: number;
        goals: number;
        assists: number;
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
        const diffMs = now.getTime() - this.birthday.getTime();
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

    @Column({ type: 'float', default: 0.0 })
    experience!: number;

    @Column({ type: 'float', default: 3.0 })
    form!: number;

    @Column({ type: 'float', default: 3.0 })
    stamina!: number;

    @Column({ name: 'career_stats', type: 'jsonb', default: '{}' })
    careerStats!: CareerStats;

    @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
    deletedAt?: Date;
}
