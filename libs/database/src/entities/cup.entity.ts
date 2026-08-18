import { AbstractEntity } from './abstract.entity';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { Uuid } from '../types/common.type';

/**
 * Status of a single cup competition (e.g. "National Cup 2026/27").
 * Lifecycle: PENDING (entries + bracket not yet generated) →
 *   IN_PROGRESS (round 0+ matches scheduled) → COMPLETED
 *   (final match played, winner decided).
 */
export enum CupStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

/**
 * One cup competition per (season, type) tuple. The MVP only has
 * one cup type (`NATIONAL`) — the enum leaves room for Senior Cup,
 * Trophy, Vase etc. without a schema change.
 *
 * The total number of rounds and the per-tier entry rounds are
 * **derived** by `cup-calculator.ts` from the participating
 * tiers + team counts; we don't store them here. Storing derived
 * data leads to drift bugs after a tier expansion (L5/L6 added
 * later) and forces a backfill migration. The generator writes
 * the bracket rows into `cup_bracket_slot` instead.
 */
@Entity('cup')
@Index(['season', 'type'], { unique: true })
export class CupEntity extends AbstractEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_cup_id' })
  id!: Uuid;

  /** Season number — matches `match.season`. */
  @Column({ type: 'int', nullable: false })
  season!: number;

  /**
   * Cup tier — e.g. NATIONAL, SENIOR, TROPHY, VASE.
   * MVP only uses NATIONAL; the rest are reserved for
   * future cups (Phase 2+).
   */
  @Column({ type: 'varchar', length: 32, nullable: false })
  type!: string;

  @Column({ type: 'varchar', length: 128, nullable: false })
  name!: string;

  @Column({ type: 'varchar', length: 16, default: CupStatus.PENDING })
  status!: CupStatus;

  /** ISO-4217 currency or in-game currency code, used by prize money. */
  @Column({ name: 'prize_currency', type: 'varchar', length: 8, default: 'CNY' })
  prizeCurrency!: string;

  /** Total prize pool in `prizeCurrency` units (e.g. winner + runner-up + round bonuses). */
  @Column({ name: 'prize_pool', type: 'bigint', default: 0 })
  prizePool!: string;

  constructor(data?: Partial<CupEntity>) {
    super();
    Object.assign(this, data);
  }
}
