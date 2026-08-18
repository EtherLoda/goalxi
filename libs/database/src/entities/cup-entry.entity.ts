import { AbstractEntity } from './abstract.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Uuid } from '../types/common.type';
import { CupEntity } from './cup.entity';
import { TeamEntity } from './team.entity';
import { LeagueEntity } from './league.entity';

/**
 * A team's participation record in one cup.
 *
 * `entryRound` is the round at which the team joins the bracket
 * (e.g. L4 teams enter at round 0, L1 teams enter at round 6 in
 * the L1-L4 pyramid). For L4 teams that get a bye in round 0
 * (only possible if the cup is reshaped later — current MVP
 * never gives byes to L4 Pre-Qualifying), `entryRound` would be
 * -1, but we keep this MVP simple and just store the integer.
 *
 * `eliminatedInRound` is NULL while the team is still alive;
 * set to the round number in which the team lost (or, for the
 * champion, set to the round AFTER the final — e.g. `totalRounds`
 * for a winner, `totalRounds - 1` for a runner-up).
 *
 * `seedRank` is the team's seeded rank WITHIN their entry tier
 * (1 = top of tier). Combined with `entryRound` it lets
 * `pairTeamsSeeded` produce fair round-0 brackets without
 * cross-tier ELO comparison (which would be unfair — L4 team
 * ELOs are systematically lower than L1s).
 */
@Entity('cup_entry')
@Index(['cupId', 'teamId'], { unique: true })
@Index(['cupId', 'entryRound'])
export class CupEntryEntity extends AbstractEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_cup_entry_id' })
  id!: Uuid;

  @Column({ name: 'cup_id', type: 'uuid', nullable: false })
  cupId!: Uuid;

  @ManyToOne(() => CupEntity)
  @JoinColumn({ name: 'cup_id' })
  cup?: CupEntity;

  @Column({ name: 'team_id', type: 'uuid', nullable: false })
  teamId!: Uuid;

  @ManyToOne(() => TeamEntity)
  @JoinColumn({ name: 'team_id' })
  team?: TeamEntity;

  /** Round at which the team joins the bracket (0-indexed). */
  @Column({ name: 'entry_round', type: 'int', nullable: false })
  entryRound!: number;

  /**
   * Snapshot of the team's league at cup-creation time. Used to
   * bucket the team for seeding + for the "what tier did this
   * team represent" stat line. NOT updated on promotion/relegation
   * mid-cup — the team plays in the cup under the league they had
   * when the cup started.
   */
  @Column({ name: 'source_league_id', type: 'uuid', nullable: true })
  sourceLeagueId?: Uuid | null;

  @ManyToOne(() => LeagueEntity)
  @JoinColumn({ name: 'source_league_id' })
  sourceLeague?: LeagueEntity;

  /** Tier number (1 = top), snapshot from source league at entry. */
  @Column({ name: 'tier', type: 'int', nullable: false })
  tier!: number;

  /** Seed within tier (1 = top seed). Populated by the generator. */
  @Column({ name: 'seed_rank', type: 'int', nullable: false, default: 0 })
  seedRank!: number;

  /** ELO snapshot — drives cross-tier seeding in rounds where tiers merge. */
  @Column({ name: 'elo_snapshot', type: 'int', nullable: false, default: 1500 })
  eloSnapshot!: number;

  /** Round number where this team was eliminated. NULL = still alive. */
  @Column({ name: 'eliminated_in_round', type: 'int', nullable: true })
  eliminatedInRound?: number | null;

  /**
   * Final position (1 = champion, 2 = runner-up, etc.).
   * NULL while the team is still alive; populated by the
   * progress worker when the team is eliminated.
   */
  @Column({ name: 'final_position', type: 'int', nullable: true })
  finalPosition?: number | null;

  constructor(data?: Partial<CupEntryEntity>) {
    super();
    Object.assign(this, data);
  }
}
