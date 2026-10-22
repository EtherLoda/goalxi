import { AbstractEntity } from './abstract.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Stadium Entity
 *
 * 球场属性：
 * - capacity: 球场容量
 * - isBuilt: 是否已建成
 */

@Entity('stadium')
export class StadiumEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'team_id', type: 'uuid' })
    teamId!: string;

    /** 球场容量 */
    @Column({ type: 'int', default: 5000 })
    capacity!: number;

    /**
     * 球场等级 (1-5)。等级本身不产生任何收入 —— 它只是容量上限的通行证:
     * 等级 N 最多容纳 N × `STADIUM_CAPACITY_PER_LEVEL` 个座位。
     *
     * Deliberately not a revenue multiplier: the ground is meant to be a
     * permanent, capacity-based asset whose value depends on staying
     * successful enough to fill it, not a compounding edge over new clubs.
     */
    @Column({ type: 'int', default: 1 })
    level!: number;

    /** 是否已建成 */
    @Column({ name: 'is_built', type: 'boolean', default: true })
    isBuilt!: boolean;

    /** 球场名称 */
    @Column({ type: 'varchar', length: 128, default: 'Home Stadium' })
    name!: string;

    constructor(data?: Partial<StadiumEntity>) {
        super();
        Object.assign(this, data);
    }
}

/** 每座位建造费用 */
export const STADIUM_COST_PER_SEAT = 50;

/** 拆除返还比例 */
export const STADIUM_DEMOLISH_REFUND_RATE = 0.3;
