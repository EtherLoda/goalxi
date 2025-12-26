import { TeamEntity } from './team.entity';
import { LeagueEntity } from './league.entity';
import { AbstractEntity } from './abstract.entity';
import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';

export enum MatchStatus {
    SCHEDULED = 'scheduled',
    TACTICS_LOCKED = 'tactics_locked',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
}

export enum MatchType {
    LEAGUE = 'league',
    CUP = 'cup',
    TOURNAMENT = 'tournament',
    FRIENDLY = 'friendly',
    NATIONAL_TEAM = 'national_team',
}

@Entity('match')
@Index(['leagueId', 'season', 'week'])
@Index(['homeTeamId'])
@Index(['awayTeamId'])
export class MatchEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'league_id', type: 'uuid' })
    leagueId!: string;

    @ManyToOne(() => LeagueEntity)
    @JoinColumn({ name: 'league_id' })
    league?: LeagueEntity;

    @Column({ type: 'int' })
    season!: number;

    @Column({ type: 'int' })
    week!: number;

    @Column({ name: 'home_team_id', type: 'uuid' })
    homeTeamId!: string;

    @ManyToOne(() => TeamEntity, { eager: true })
    @JoinColumn({ name: 'home_team_id' })
    homeTeam?: TeamEntity;

    @Column({ name: 'away_team_id', type: 'uuid' })
    awayTeamId!: string;

    @ManyToOne(() => TeamEntity, { eager: true })
    @JoinColumn({ name: 'away_team_id' })
    awayTeam?: TeamEntity;

    @Column({ name: 'scheduled_at', type: 'timestamp' })
    scheduledAt!: Date;

    @Column({ type: 'varchar', length: 20, default: MatchStatus.SCHEDULED })
    status!: MatchStatus;

    @Column({ type: 'varchar', length: 30, default: MatchType.LEAGUE })
    type!: MatchType;

    @Column({ name: 'home_score', type: 'int', nullable: true })
    homeScore?: number;

    @Column({ name: 'away_score', type: 'int', nullable: true })
    awayScore?: number;

    @Column({ name: 'simulation_completed_at', type: 'timestamp', nullable: true })
    simulationCompletedAt?: Date;

    @Column({ name: 'tactics_locked', type: 'boolean', default: false })
    tacticsLocked!: boolean;

    @Column({ name: 'home_forfeit', type: 'boolean', default: false })
    homeForfeit!: boolean;

    @Column({ name: 'away_forfeit', type: 'boolean', default: false })
    awayForfeit!: boolean;

    @Column({ name: 'started_at', type: 'timestamp', nullable: true })
    startedAt?: Date;

    @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
    completedAt?: Date;

    @Column({ name: 'first_half_injury_time', type: 'int', nullable: true })
    firstHalfInjuryTime?: number;

    @Column({ name: 'second_half_injury_time', type: 'int', nullable: true })
    secondHalfInjuryTime?: number;

    @Column({ name: 'has_extra_time', type: 'boolean', default: false })
    hasExtraTime!: boolean;

    @Column({ name: 'extra_time_first_half_injury', type: 'int', nullable: true })
    extraTimeFirstHalfInjury?: number;

    @Column({ name: 'extra_time_second_half_injury', type: 'int', nullable: true })
    extraTimeSecondHalfInjury?: number;

    @Column({ name: 'has_penalty_shootout', type: 'boolean', default: false })
    hasPenaltyShootout!: boolean;

    constructor(partial?: Partial<MatchEntity>) {
        super();
        Object.assign(this, partial);
    }
}
