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

    /** 是否已建成 */
    @Column({ name: 'is_built', type: 'boolean', default: true })
    isBuilt!: boolean;

    constructor(data?: Partial<StadiumEntity>) {
        super();
        Object.assign(this, data);
    }
}

/** 每座位建造费用 */
export const STADIUM_COST_PER_SEAT = 50;

/** 拆除返还比例 */
export const STADIUM_DEMOLISH_REFUND_RATE = 0.3;
