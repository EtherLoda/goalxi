import { AbstractEntity } from './abstract.entity';
import { Uuid } from '../types/common.type';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('archived_player_competition_stats')
@Index(['playerId', 'season'])
@Index(['leagueId', 'season', 'goals'])
@Index(['leagueId', 'season', 'assists'])
export class ArchivedPlayerCompetitionStatsEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: Uuid;

    @Column({ name: 'player_id', type: 'uuid' })
    playerId!: Uuid;

    @Column({ name: 'league_id', type: 'uuid' })
    leagueId!: Uuid;

    @Column({ type: 'int' })
    season!: number;

    @Column({ type: 'int', default: 0 })
    goals!: number;

    @Column({ type: 'int', default: 0 })
    assists!: number;

    @Column({ type: 'int', default: 0 })
    tackles!: number;

    @Column({ name: 'yellow_cards', type: 'int', default: 0 })
    yellowCards!: number;

    @Column({ name: 'red_cards', type: 'int', default: 0 })
    redCards!: number;

    @Column({ type: 'int', default: 0 })
    starts!: number;

    @Column({ name: 'substitute_appearances', type: 'int', default: 0 })
    substituteAppearances!: number;

    @Column({ type: 'int', default: 0 })
    appearances!: number;

    @Column({ name: 'archived_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    archivedAt!: Date;
}
