import { AbstractEntity } from './abstract.entity';
import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Single-row-per-key system configuration table. Holds a tiny
 * set of cross-process anchors that need to survive settlement
 * restarts (i.e. cannot live in env vars alone, because env vars
 * drift between deploys / pods).
 *
 * Current keys:
 *   - `init_date` (ISO 8601 date `YYYY-MM-DD`) — the date the
 *     first `pnpm init:run` ran. The first match of season 1
 *     is the following Monday at 00:00 UTC; subsequent
 *     restarts of the settlement service read this row so
 *     `currentWeekIndex()` and the match scheduler agree on
 *     the week boundary even when the env var is missing or
 *     stale.
 *
 * Sized small on purpose — anything we want to track here
 * should fit on a single line and never include a JSON blob
 * bigger than the column allows. If we ever need fancier
 * config, the right move is a separate config table, not
 * growing this one.
 */
@Entity('system_config')
export class SystemConfigEntity extends AbstractEntity {
  @PrimaryColumn({ name: 'key', type: 'varchar', length: 64 })
  key!: string;

  /** Free-form value. For dates we use `YYYY-MM-DD`. */
  @Column({ name: 'value', type: 'varchar', length: 256 })
  value!: string;

  constructor(data?: Partial<SystemConfigEntity>) {
    super();
    Object.assign(this, data);
  }
}
