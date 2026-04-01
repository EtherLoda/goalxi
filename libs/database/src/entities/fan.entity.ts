import { AbstractEntity } from './abstract.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Fan Entity
 *
 * 球迷属性：
 * - totalFans: 球迷总数
 * - fanEmotion: 球迷情绪 (0-100)，每20分一档，共5档
 * - recentForm: 最近5场结果 (如 "WWDLL")
 */

/** 球迷隐藏上限 */
export const FAN_HIDDEN_CAP = {
    1: 300_000,   // L1: 30万
    2: 200_000,   // L2: 20万
    3: 150_000,   // L3: 15万
    4: 100_000,   // L4: 10万
} as const;

/** 球迷情绪档次名称 */
export const FAN_EMOTION_TIER_NAMES = {
    0: { en: 'Hollow', zh: '沉寂' },
    1: { en: 'Simmering', zh: '冷却' },
    2: { en: 'Uncertain', zh: '观望' },
    3: { en: 'Building', zh: '升温' },
    4: { en: 'On Fire', zh: '狂热' },
} as const;

/** 基础周增长 */
export const FAN_BASE_GROWTH = 2500;

/** 基础周流失 */
export const FAN_BASE_LOSS = 50;

/** 上限压力曲线指数 */
export const FAN_CAP_SMOOTHING = 2;

/** 联赛票价系数 */
export const TICKET_PRICE_MULTIPLIER = {
    1: 2.0,   // L1
    2: 1.5,   // L2
    3: 1.0,   // L3
    4: 1.0,   // L4
} as const;

@Entity('fan')
export class FanEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'team_id', type: 'uuid' })
    teamId!: string;

    /** 球迷总数 */
    @Column({ name: 'total_fans', type: 'int', default: 10000 })
    totalFans!: number;

    /** 球迷情绪 (0-100) */
    @Column({ name: 'fan_emotion', type: 'int', default: 50 })
    fanEmotion!: number;

    /** 最近5场结果 */
    @Column({ name: 'recent_form', type: 'varchar', length: 10, default: '' })
    recentForm!: string;

    constructor(data?: Partial<FanEntity>) {
        super();
        Object.assign(this, data);
    }
}
