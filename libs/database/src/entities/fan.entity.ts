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

/** 球迷隐藏上限 = 基准值100,000 × 联赛票价倍率 */
export const FAN_HIDDEN_CAP = {
    1: 300_000,   // L1: 基准10万 × 2.0 = 30万
    2: 200_000,   // L2: 基准10万 × 1.6 = 16万 → 20万（四舍五入）
    3: 150_000,   // L3: 基准10万 × 1.3 = 13万 → 15万（四舍五入）
    4: 110_000,   // L4: 基准10万 × 1.1 = 11万
    5: 100_000,   // L5+: 基准10万 × 1.0 = 10万
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
    2: 1.6,   // L2
    3: 1.3,   // L3
    4: 1.1,   // L4
} as const;

/** 获取票价系数（超过L4的都返回1.0） */
export function getTicketMultiplier(tier: number): number {
    return TICKET_PRICE_MULTIPLIER[tier as keyof typeof TICKET_PRICE_MULTIPLIER] ?? 1.0;
}

/** 球迷天花板基准值 */
export const FAN_CAP_BASE = 100_000;

/** 获取球迷天花板（超过L4的都返回基准值） */
export function getFanCap(tier: number): number {
    const multiplier = getTicketMultiplier(tier);
    return Math.round(FAN_CAP_BASE * multiplier);
}

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
