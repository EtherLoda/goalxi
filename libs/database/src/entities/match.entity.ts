import { TeamEntity } from './team.entity';
import { AbstractEntity } from './abstract.entity';
import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('match')
export class MatchEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => TeamEntity, { eager: true })
    @JoinColumn({ name: 'home_team_id' })
    homeTeam: TeamEntity;

    @Column({ name: 'home_team_id' })
    homeTeamId: string;

    @ManyToOne(() => TeamEntity, { eager: true })
    @JoinColumn({ name: 'away_team_id' })
    awayTeam: TeamEntity;

    @Column({ name: 'away_team_id' })
    awayTeamId: string;

    @Column({ name: 'home_score', default: 0 })
    homeScore: number;

    @Column({ name: 'away_score', default: 0 })
    awayScore: number;

    @Column({ type: 'timestamptz', name: 'match_date' })
    matchDate: Date;

    @Column({ default: 'scheduled' })
    status: 'scheduled' | 'in_progress' | 'completed';

    @Column({ name: 'match_type', default: 'league' })
    matchType: 'league' | 'cup' | 'friendly' | 'playoff';

    @Column({ nullable: true })
    season: number;

    @Column({ nullable: true, name: 'league_id' })
    leagueId: string;
}
