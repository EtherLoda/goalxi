import { LeagueEntity } from './league.entity';
import { TeamEntity } from './team.entity';
import { AbstractEntity } from './abstract.entity';
import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
} from 'typeorm';

@Entity('season_result')
@Unique(['teamId', 'season'])
export class SeasonResultEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'team_id' })
    team: TeamEntity;

    @Column({ name: 'team_id' })
    teamId: string;

    @ManyToOne(() => LeagueEntity)
    @JoinColumn({ name: 'league_id' })
    league: LeagueEntity;

    @Column({ name: 'league_id' })
    leagueId: string;

    @Column()
    season: number;

    @Column({ name: 'final_position' })
    finalPosition: number;

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

    @Column({ default: false })
    promoted: boolean;

    @Column({ default: false })
    relegated: boolean;
}
