import { AbstractEntity } from './abstract.entity';
import { Column, Entity, Index, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { YouthLeagueEntity } from './youth-league.entity';
import { YouthTeamEntity } from './youth-team.entity';

export enum YouthMatchStatus {
    SCHEDULED = 'scheduled',
    TACTICS_LOCKED = 'tactics_locked',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
}

@Entity('youth_match')
@Index(['youthLeagueId', 'season', 'week'])
export class YouthMatchEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'youth_league_id', type: 'uuid' })
    youthLeagueId!: string;

    @ManyToOne(() => YouthLeagueEntity)
    @JoinColumn({ name: 'youth_league_id' })
    youthLeague?: YouthLeagueEntity;

    @Column({ type: 'int' })
    season!: number;

    @Column({ type: 'int' })
    week!: number;

    @Column({ name: 'home_youth_team_id', type: 'uuid' })
    homeYouthTeamId!: string;

    @ManyToOne(() => YouthTeamEntity, { eager: true })
    @JoinColumn({ name: 'home_youth_team_id' })
    homeYouthTeam?: YouthTeamEntity;

    @Column({ name: 'away_youth_team_id', type: 'uuid' })
    awayYouthTeamId!: string;

    @ManyToOne(() => YouthTeamEntity, { eager: true })
    @JoinColumn({ name: 'away_youth_team_id' })
    awayYouthTeam?: YouthTeamEntity;

    @Column({ name: 'scheduled_at', type: 'timestamp' })
    scheduledAt!: Date;

    @Column({ type: 'varchar', length: 20, default: YouthMatchStatus.SCHEDULED })
    status!: YouthMatchStatus;

    @Column({ name: 'home_score', type: 'int', nullable: true })
    homeScore?: number;

    @Column({ name: 'away_score', type: 'int', nullable: true })
    awayScore?: number;

    @Column({ name: 'simulation_completed_at', type: 'timestamp', nullable: true })
    simulationCompletedAt?: Date;

    @Column({ name: 'tactics_locked_at', type: 'timestamp', nullable: true })
    tacticsLockedAt?: Date;

    @Column({ name: 'actual_end_time', type: 'timestamp', nullable: true })
    actualEndTime?: Date;

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

    @Column({ name: 'requires_winner', type: 'boolean', default: false })
    requiresWinner!: boolean;

    @Column({ name: 'extra_time_first_half_injury', type: 'int', nullable: true })
    extraTimeFirstHalfInjury?: number;

    @Column({ name: 'extra_time_second_half_injury', type: 'int', nullable: true })
    extraTimeSecondHalfInjury?: number;

    @Column({ name: 'has_penalty_shootout', type: 'boolean', default: false })
    hasPenaltyShootout!: boolean;
}
