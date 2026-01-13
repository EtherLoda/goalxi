import {
    BaseEntity,
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { MatchEntity } from './match.entity';
import { TeamEntity } from './team.entity';

@Entity('match_team_stats')
export class MatchTeamStatsEntity extends BaseEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'match_id', type: 'uuid' })
    matchId!: string;

    @ManyToOne(() => MatchEntity)
    @JoinColumn({ name: 'match_id' })
    match?: MatchEntity;

    @Column({ name: 'team_id', type: 'uuid' })
    teamId!: string;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'team_id' })
    team?: TeamEntity;

    @Column({ name: 'possession_percentage', type: 'decimal', precision: 5, scale: 2, nullable: true })
    possessionPercentage?: number;

    @Column({ type: 'int', default: 0 })
    shots!: number;

    @Column({ name: 'shots_on_target', type: 'int', default: 0 })
    shotsOnTarget!: number;

    @Column({ type: 'int', default: 0 })
    corners!: number;

    @Column({ name: 'free_kicks', type: 'int', default: 0 })
    freeKicks!: number;

    @Column({ name: 'free_kick_goals', type: 'int', default: 0 })
    freeKickGoals!: number;

    @Column({ name: 'indirect_free_kicks', type: 'int', default: 0 })
    indirectFreeKicks!: number;

    @Column({ name: 'indirect_free_kick_goals', type: 'int', default: 0 })
    indirectFreeKickGoals!: number;

    @Column({ type: 'int', default: 0 })
    penalties!: number;

    @Column({ name: 'penalty_goals', type: 'int', default: 0 })
    penaltyGoals!: number;

    @Column({ type: 'int', default: 0 })
    fouls!: number;

    @Column({ type: 'int', default: 0 })
    offsides!: number;

    @Column({ name: 'yellow_cards', type: 'int', default: 0 })
    yellowCards!: number;

    @Column({ name: 'red_cards', type: 'int', default: 0 })
    redCards!: number;

    @Column({ name: 'passes_completed', type: 'int', default: 0 })
    passesCompleted!: number;

    @Column({ name: 'passes_attempted', type: 'int', default: 0 })
    passesAttempted!: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    constructor(partial?: Partial<MatchTeamStatsEntity>) {
        super();
        Object.assign(this, partial);
    }
}
