import { AbstractEntity } from './abstract.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Uuid } from '../types/common.type';
import { CupEntity } from './cup.entity';

/**
 * Round shape — drives UI labels and bracket progress.
 *
 *   QUALIFYING: a round where some teams enter the cup for the
 *     first time (Pre-Qualifying, Qualifying R1, R2, etc.). The
 *     L4 1024-team Pre-Qualifying is a QUALIFYING round.
 *   PROPER: a round where the competition has consolidated to
 *     one bracket, but a new tier's entries are still joining
 *     (e.g. R2 in the National Cup is when L1 enters).
 *   KNOCKOUT: a round where every remaining team is in the same
 *     bracket and no new entries join (e.g. R3 onwards in
 *     National Cup, R4 onwards if L1 entered earlier).
 *   FINAL: a single-match round (SF, Final).
 *
 * Note PROPER + KNOCKOUT is a finer distinction than the FA Cup
 * uses — the FA Cup just calls everything "Proper" from R1. We
 * split them so the FE can render "L1 entries join" badges on
 * PROPER rounds and "winner takes all" badges on KNOCKOUT rounds.
 */
export enum CupRoundKind {
  QUALIFYING = 'qualifying',
  PROPER = 'proper',
  KNOCKOUT = 'knockout',
  FINAL = 'final',
}

export enum CupRoundStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

/**
 * One row per round per cup. The `roundNumber` is 0-indexed:
 *
 *   round 0   = Pre-Qualifying (L4 enters)
 *   round 1   = Qualifying R1 (still all L4)
 *   round 2   = Qualifying R2 (L3 lower enters)
 *   ...
 *   round 6   = R2 (L1 enters)
 *   round 7   = R3 (knockout proper)
 *   round 10  = Final
 *
 * The round that contains the FINAL must have `kind = FINAL` so
 * the FE can render the trophy ceremony + neutral-venue pick.
 */
@Entity('cup_round')
@Index(['cupId', 'roundNumber'], { unique: true })
export class CupRoundEntity extends AbstractEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_cup_round_id' })
  id!: Uuid;

  @Column({ name: 'cup_id', type: 'uuid', nullable: false })
  cupId!: Uuid;

  @ManyToOne(() => CupEntity)
  @JoinColumn({ name: 'cup_id' })
  cup?: CupEntity;

  /** 0-indexed round number within the cup (0 = first round played). */
  @Column({ name: 'round_number', type: 'int', nullable: false })
  roundNumber!: number;

  /** Display name, e.g. "Pre-Qualifying", "Qualifying R2", "R3", "Quarter-Final", "Final". */
  @Column({ name: 'round_name', type: 'varchar', length: 64, nullable: false })
  roundName!: string;

  @Column({ type: 'varchar', length: 16, default: CupRoundKind.QUALIFYING })
  kind!: CupRoundKind;

  @Column({ type: 'varchar', length: 16, default: CupRoundStatus.PENDING })
  status!: CupRoundStatus;

  /**
   * Number of `cup_bracket_slot` rows in this round (matches +
   * byes). For round 0 of a 1024-team entry this is 512; after
   * L1 joins in round 6 of the same cup, this is e.g. 28.
   */
  @Column({ name: 'slot_count', type: 'int', nullable: false, default: 0 })
  slotCount!: number;

  /**
   * Deadline for users to submit tactics for the matches in
   * this round. The match preprocessor (existing infra) reads
   * this when locking cup matches. NULL for non-user-facing
   * rounds (e.g. Pre-Qualifying when all teams are BOTs and
   * sim is automatic — though in MVP we sim everyone).
   */
  @Column({ name: 'tactics_deadline', type: 'timestamptz', nullable: true })
  tacticsDeadline?: Date | null;

  /** Earliest scheduled kickoff for any match in this round. */
  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt?: Date | null;

  constructor(data?: Partial<CupRoundEntity>) {
    super();
    Object.assign(this, data);
  }
}
