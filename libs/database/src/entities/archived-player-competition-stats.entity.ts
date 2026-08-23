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

    @Column({ name: 'player_id', type: 'int' })
    playerId!: number;

    // [Fix 2026-08-23] Mirrors player_competition_stats.league_id becoming
    // nullable so the season-archive service (which copies rows from the
    // live table to this archive at season end) doesn't blow up on cup/
    // youth rows that have leagueId = null. Same PG UNIQUE-nulls-distinct
    // semantics apply.
    @Column({ name: 'league_id', type: 'uuid', nullable: true })
    leagueId?: Uuid | null;

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
