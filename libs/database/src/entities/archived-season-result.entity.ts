import { LeagueEntity } from './league.entity';
import { TeamEntity } from './team.entity';
import { AbstractEntity } from './abstract.entity';
import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('archived_season_result')
@Index(['season', 'leagueId', 'finalPosition'])
@Index(['teamId', 'season'])
export class ArchivedSeasonResultEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'team_id', type: 'uuid' })
    teamId!: string;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'team_id' })
    team?: TeamEntity;

    @Column({ name: 'league_id', type: 'uuid' })
    leagueId!: string;

    @ManyToOne(() => LeagueEntity)
    @JoinColumn({ name: 'league_id' })
    league?: LeagueEntity;

    @Column({ type: 'int' })
    season!: number;

    @Column({ name: 'final_position' })
    finalPosition!: number;

    @Column({ default: 0 })
    points!: number;

    @Column({ default: 0 })
    wins!: number;

    @Column({ default: 0 })
    draws!: number;

    @Column({ default: 0 })
    losses!: number;

    @Column({ name: 'goals_for', default: 0 })
    goalsFor!: number;

    @Column({ name: 'goals_against', default: 0 })
    goalsAgainst!: number;

    @Column({ name: 'goal_difference', default: 0 })
    goalDifference!: number;

    @Column({ default: false })
    promoted!: boolean;

    @Column({ default: false })
    relegated!: boolean;

    @Column({ name: 'archived_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    archivedAt!: Date;
}
