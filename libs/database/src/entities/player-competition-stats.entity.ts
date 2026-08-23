import { AbstractEntity } from './abstract.entity';
import { Uuid } from '../types/common.type';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('player_competition_stats')
@Index(['leagueId', 'season', 'goals'])
@Index(['leagueId', 'season', 'assists'])
@Index(['leagueId', 'season', 'tackles'])
export class PlayerCompetitionStatsEntity extends AbstractEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: Uuid;

  @Column({ name: 'player_id', type: 'int' })
  playerId!: number;

  // [Fix 2026-08-23] nullable: cup matches (cup-scheduler.service.ts stamps
  // leagueId = null) and youth matches (match.youthLeagueId instead) hit
  // the simulator's updatePlayerCompetitionStats with a null leagueId.
  // The previous NOT NULL column caused the bulk insert to fail and the
  // entire simulator transaction (events + match_team_stats + hat-trick
  // PlayerEvent + career stats) rolled back, silently losing the match.
  // PostgreSQL UNIQUE constraints treat NULLs as distinct so a player
  // playing both league and cup in the same season gets two rows: one
  // with leagueId=<X> and one with leagueId=null, which is what we want.
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
}
