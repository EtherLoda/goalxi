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
import { currentGameDay } from '../utils/game-clock';

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
    // `positioning` is intentionally absent: GK reads positioning from `mental`
    // (see simulation-player.ts FIELD_MAP). Removing it prevents drift between
    // the type and runtime mapping.
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
        avgContribution?: number; // 平均比赛贡献值
        avgStars?: number; // 平均比赛星级
    };
    national?: {
        matches: number;
        goals: number;
        assists: number;
        tackles: number;
        yellowCards: number;
        redCards: number;
        avgContribution?: number;
        avgStars?: number;
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

    /**
     * Human-facing 11-digit numeric ID (Hattrick-style). Displayed in URLs
     * and search; the UUID `id` stays the internal PK.
     * Stored as bigint in DB, serialized as string in API/JSON to avoid
     * JavaScript's 53-bit Number precision loss.
     * Auto-generated on insert from the UUID; not user-editable.
     */
    @Column({ name: 'display_id', type: 'bigint', unique: true })
    displayId: string;

    @Column({ name: 'team_id', type: 'uuid', nullable: true })
    teamId?: string | null;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'team_id' })
    team?: TeamEntity;

    @Column()
    name!: string;

    @Column({ type: 'varchar', length: 2, nullable: true, comment: 'ISO 3166-1 alpha-2 country code (e.g., CN, US, GB, DE)' })
    nationality?: string;

    /**
     * Absolute game-day on which this player was created (see
     * `utils/game-clock`). Age is derived from `(currentGameDay -
     * createdDay) / DAYS_PER_YEAR`, which is independent of real-world
     * timezones and produces the same value regardless of when the getter
     * is called within the same real day.
     *
     * Replaces the previous `birthday: Date` field — see migration
     * `1721000000000-ReplaceBirthdayWithCreatedDay` for the backfill that
     * preserved the displayed age of existing rows.
     */
    @Column({ name: 'created_day', type: 'int' })
    createdDay!: number;

    @Column({ name: 'is_youth', default: false })
    isYouth!: boolean;

    /** Days this player has existed in the game world. */
    get daysAlive(): number {
        return currentGameDay() - this.createdDay;
    }

    get age(): number {
        return Math.floor(this.daysAlive / GAME_SETTINGS.DAYS_PER_YEAR);
    }

    /**
     * Returns exact age as `[years, extraDays]`. Years is the whole-game-year
     * count, extraDays is the leftover (0..DAYS_PER_YEAR-1).
     *
     *   currentGameDay = 2243, createdDay = 0  →  [20, 3]
     */
    getExactAge(): [number, number] {
        const total = this.daysAlive;
        const years = Math.floor(total / GAME_SETTINGS.DAYS_PER_YEAR);
        const days = total - years * GAME_SETTINGS.DAYS_PER_YEAR;
        return [years, days];
    }

    get fractionalAge(): number {
        return this.daysAlive / GAME_SETTINGS.DAYS_PER_YEAR;
    }

    @Column({ name: 'is_goalkeeper', default: false })
    isGoalkeeper!: boolean;

    @Column({ name: 'on_transfer', default: false })
    onTransfer!: boolean;

    @Column({ name: 'specialty', type: 'varchar', length: 50, nullable: true })
    specialty?: string | null;

    @Column({ name: 'current_skills', type: 'jsonb' })
    currentSkills!: PlayerSkills;

    @Column({ name: 'potential_skills', type: 'jsonb' })
    potentialSkills!: PlayerSkills;

    @Column({ name: 'potential_ability', type: 'int', default: 50 })
    potentialAbility!: number;

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
