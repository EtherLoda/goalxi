import { AbstractEntity } from './abstract.entity';
import { Uuid } from '../types/common.type';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { type CompetitionType } from '../constants/competition-type';

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

  // [Fix 2026-08-23] Explicit competition-bucket discriminator.
  // The previous nullable-leagueId migration (1736000000000)
  // let cup / youth / friendly / national-team matches share the
  // table, but the only way to tell them apart was `leagueId IS
  // NULL` - an inference that conflates every non-league
  // competition. This column is set by the simulator's
  // `updatePlayerCompetitionStats` (using
  // `competitionTypeForMatch()` from
  // `constants/competition-type`) so the FE can render a
  // league/cup/youth split without inferring it from the
  // null-state of the leagueId column.
  @Column({
    name: 'competition_type',
    type: 'varchar',
    length: 20,
    // Default at the column level. The DB-level CHECK
    // constraint in migration 1737000000000 keeps the
    // value in {LEAGUE, CUP, YOUTH, OTHER}.
    default: () => "'LEAGUE'",
  })
  competitionType!: CompetitionType;

  @Column({ type: 'int', default: 0 })
  goals!: number;

  @Column({ type: 'int', default: 0 })
  assists!: number;

  @Column({ type: 'int', default: 0 })
  tackles!: number;

  // Total shot attempts in the period (goal / miss / save /
  // blocked). See AddShotsSavesToPlayerCompetitionStats
  // migration for the engine-side definition.
  @Column({ type: 'int', default: 0 })
  shots!: number;

  // Total saves by this player. Only save outcomes
  // count and only the defending GK is credited.
  @Column({ type: 'int', default: 0 })
  saves!: number;

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
