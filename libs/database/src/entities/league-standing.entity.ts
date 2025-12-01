import { TeamEntity } from './team.entity';
import { LeagueEntity } from './league.entity';
import { AbstractEntity } from './abstract.entity';
import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
} from 'typeorm';

@Entity('league_standing')
@Unique(['leagueId', 'teamId'])
export class LeagueStandingEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => LeagueEntity)
    @JoinColumn({ name: 'league_id' })
    league: LeagueEntity;

    @Column({ name: 'league_id' })
    leagueId: string;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'team_id' })
    team: TeamEntity;

    @Column({ name: 'team_id' })
    teamId: string;

    @Column({ type: 'int', nullable: false, default: 1 })
    season: number;

    @Column({ default: 0 })
    position: number;

    @Column({ default: 0 })
    points: number;

    @Column({ default: 0 })
    wins: number;

    @Column({ default: 0 })
    draws: number;

    @Column({ default: 0 })
    losses: number;

    @Column({ name: 'goals_for', default: 0 })
    goalsFor: number;

    @Column({ name: 'goals_against', default: 0 })
    goalsAgainst: number;
}
