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
import { CupRoundEntity } from './cup-round.entity';
import { TeamEntity } from './team.entity';
import { MatchEntity } from './match.entity';

/**
 * A pair-position in one round of one cup. Two slots per match
 * (home + away), one slot per bye. The generator creates one
 * row per (cup, round, slotIndex) tuple.
 *
 * `slotIndex` is 0-based within a round: slots 0 and 1 form
 * the first match, slots 2 and 3 form the second, etc. A bye
 * occupies a single odd slot — `homeTeamId = advancingTeamId`,
 * `awayTeamId = NULL`, `isBye = true`. The simulator/scheduler
 * recognizes the bye and skips match creation.
 *
 * Why a separate table (instead of denormalizing into MatchEntity)?
 * - Byes don't have a `MatchEntity` row but still need a stable
 *   slot identifier so the next round's bracket can point at them.
 * - FE bracket rendering wants to know "this slot exists even if
 *   no match is scheduled yet" (round not started) vs "this slot
 *   was a bye" (round finished but no match played).
 * - Cross-round traceability: a slot in round N references
 *   `sourceSlotId` from round N-1 (the slot the winner came from).
 *   Storing this on the slot row is much cleaner than walking
 *   match rows back through two relations.
 */
@Entity('cup_bracket_slot')
@Index(['cupId', 'roundId', 'slotIndex'], { unique: true })
@Index(['cupId', 'roundId', 'homeTeamId'])
@Index(['cupId', 'roundId', 'awayTeamId'])
export class CupBracketSlotEntity extends AbstractEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_cup_bracket_slot_id' })
  id!: Uuid;

  @Column({ name: 'cup_id', type: 'uuid', nullable: false })
  cupId!: Uuid;

  @ManyToOne(() => CupEntity)
  @JoinColumn({ name: 'cup_id' })
  cup?: CupEntity;

  @Column({ name: 'round_id', type: 'uuid', nullable: false })
  roundId!: Uuid;

  @ManyToOne(() => CupRoundEntity)
  @JoinColumn({ name: 'round_id' })
  round?: CupRoundEntity;

  /** Convenience mirror of round.roundNumber for fast queries without join. */
  @Column({ name: 'round_number', type: 'int', nullable: false })
  roundNumber!: number;

  /** 0-based position within the round. Two slots = 1 match. */
  @Column({ name: 'slot_index', type: 'int', nullable: false })
  slotIndex!: number;

  @Column({ name: 'home_team_id', type: 'uuid', nullable: true })
  homeTeamId?: Uuid | null;

  @Column({ name: 'away_team_id', type: 'uuid', nullable: true })
  awayTeamId?: Uuid | null;

  @ManyToOne(() => TeamEntity)
  @JoinColumn({ name: 'home_team_id' })
  homeTeam?: TeamEntity;

  @ManyToOne(() => TeamEntity)
  @JoinColumn({ name: 'away_team_id' })
  awayTeam?: TeamEntity;

  /**
   * The match row for this slot. NULL while the round is PENDING
   * (match not yet generated) or when `isBye = true`.
   */
  @Column({ name: 'match_id', type: 'uuid', nullable: true })
  matchId?: Uuid | null;

  @ManyToOne(() => MatchEntity)
  @JoinColumn({ name: 'match_id' })
  match?: MatchEntity;

  /**
   * Team that won this slot. NULL until the match is COMPLETED
   * (or, for byes, until the slot is "resolved" by the generator
   * — which sets it immediately to the home team).
   */
  @Column({ name: 'winner_team_id', type: 'uuid', nullable: true })
  winnerTeamId?: Uuid | null;

  /**
   * The slot in the previous round whose winner populated this
   * slot. NULL for round 0 (the team entered the cup directly)
   * and for the bye-half of an asymmetric bracket (FA Cup
   * gives byes to top-tier teams, so a "previous round" doesn't
   * exist for them).
   */
  @Column({ name: 'source_slot_id', type: 'uuid', nullable: true })
  sourceSlotId?: Uuid | null;

  @ManyToOne(() => CupBracketSlotEntity)
  @JoinColumn({ name: 'source_slot_id' })
  sourceSlot?: CupBracketSlotEntity;

  /** True if this slot is a bye (one team auto-advances). */
  @Column({ name: 'is_bye', type: 'boolean', default: false })
  isBye!: boolean;

  constructor(data?: Partial<CupBracketSlotEntity>) {
    super();
    Object.assign(this, data);
  }
}
