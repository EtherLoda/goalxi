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
import { TeamEntity } from './team.entity';

/**
 * §5 Stadium — Queued construction / demolition project.
 *
 * Lifecycle:
 *   1. Manager opens the dialog in the Stadium page, drags a slider, confirms.
 *   2. The api service inserts a row with status=IN_PROGRESS, deducts funds
 *      for an EXPAND immediately, and computes `remainingWeeks` from the
 *      speed constants in `stadium-construction.constants.ts`.
 *   3. The weekly settlement cron decrements `remainingWeeks` once per tick.
 *   4. When `remainingWeeks` hits 0 the processor applies the capacity change
 *      to the linked `StadiumEntity`, sets status=COMPLETED, records a
 *      refund transaction (DEMOLISH only), and emits a notification to the
 *      team's manager.
 *
 * The seat capacity itself lives on `StadiumEntity.capacity` and stays
 * unchanged for the entire duration — UI shows the "queued" target as a
 * separate badge so the manager can see what is coming.
 */
export enum StadiumConstructionKind {
  EXPAND = 'EXPAND',
  DEMOLISH = 'DEMOLISH',
}

export enum StadiumConstructionStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  /** Reserved — the MVP does not allow cancellation (locked-in once started). */
  CANCELLED = 'CANCELLED',
}

@Entity('stadium_construction')
@Index('IDX_stadium_construction_team_status', ['teamId', 'status'])
@Index('IDX_stadium_construction_status_remaining', ['status', 'remainingWeeks'])
export class StadiumConstructionEntity extends AbstractEntity {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_stadium_construction_id',
  })
  id!: Uuid;

  @Column({ name: 'team_id', type: 'uuid' })
  teamId!: Uuid;

  @ManyToOne(() => TeamEntity)
  @JoinColumn({ name: 'team_id' })
  team?: TeamEntity;

  @Column({ type: 'enum', enum: StadiumConstructionKind })
  kind!: StadiumConstructionKind;

  /**
   * Seats being added (EXPAND, positive) or removed (DEMOLISH, positive).
   * The sign is conveyed by `kind`, not by the column value.
   */
  @Column({ name: 'delta_seats', type: 'int' })
  deltaSeats!: number;

  /** Capacity snapshot at queue time — used to render the project card. */
  @Column({ name: 'starting_capacity', type: 'int' })
  startingCapacity!: number;

  /** What `StadiumEntity.capacity` will be set to on completion. */
  @Column({ name: 'ending_capacity', type: 'int' })
  endingCapacity!: number;

  @Column({ name: 'total_weeks', type: 'int' })
  totalWeeks!: number;

  /** Ticks down from `totalWeeks` to 0; on hit, the processor applies the change. */
  @Column({ name: 'remaining_weeks', type: 'int' })
  remainingWeeks!: number;

  /**
   * Money locked in at queue time (EXPAND only — debited from the club).
   * DEMOLISH rows store the same value but the actual deduction is 0 at
   * queue time; the refund is recorded on completion (see `refund`).
   */
  @Column({ type: 'int' })
  cost!: number;

  /**
   * For DEMOLISH: refund amount paid out on completion.
   * For EXPAND: always 0 (no refund — the cost was a real expense).
   */
  @Column({ type: 'int', default: 0 })
  refund!: number;

  @Column({
    type: 'enum',
    enum: StadiumConstructionStatus,
    default: StadiumConstructionStatus.IN_PROGRESS,
  })
  status!: StadiumConstructionStatus;

  /** Game-week stamp at queue time — useful for the audit timeline. */
  @Column({ name: 'season_started', type: 'int' })
  seasonStarted!: number;

  @Column({ name: 'week_started', type: 'int' })
  weekStarted!: number;

  /** Game-week stamp at completion (null until the processor finalizes the row). */
  @Column({ name: 'season_completed', type: 'int', nullable: true })
  seasonCompleted?: number;

  @Column({ name: 'week_completed', type: 'int', nullable: true })
  weekCompleted?: number;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date;

  constructor(data?: Partial<StadiumConstructionEntity>) {
    super();
    Object.assign(this, data);
  }
}