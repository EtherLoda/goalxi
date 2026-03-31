import { Uuid } from '../types/common.type';
import { AbstractEntity } from './abstract.entity';
import { Column, DeleteDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('league')
export class LeagueEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_league_id' })
    id!: Uuid;

    @Column({ type: 'varchar', nullable: false })
    name!: string;

    /** 1 = 顶级, 2 = 二级, 3 = 三级, 以此类推 */
    @Column({ type: 'int', nullable: false, default: 1 })
    tier!: number;

    /** 同级联赛内的分区编号 (如 L2: 1-4, L3: 1-16) */
    @Column({ type: 'int', nullable: false, default: 1 })
    tierDivision!: number;

    /** 联赛最大球队数，默认 16 */
    @Column({ type: 'int', nullable: false, default: 16 })
    maxTeams!: number;

    /** 直接升级名额，默认 1 */
    @Column({ name: 'promotion_slots', type: 'int', nullable: false, default: 1 })
    promotionSlots!: number;

    /** 升降级附加赛名额（9-12名），默认 4 */
    @Column({ name: 'playoff_slots', type: 'int', nullable: false, default: 4 })
    playoffSlots!: number;

    /** 直接降级名额（13-16名），默认 4 */
    @Column({ name: 'relegation_slots', type: 'int', nullable: false, default: 4 })
    relegationSlots!: number;

    @Column({ type: 'varchar', default: 'active' })
    status!: string;

    /** 所属的上级联赛 ID（如 L3 联赛属于哪个 L2） */
    @Column({ name: 'parent_league_id', type: 'uuid', nullable: true })
    parentLeagueId?: Uuid;

    @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
    deletedAt?: Date | null;

    constructor(data?: Partial<LeagueEntity>) {
        super();
        Object.assign(this, data);
    }
}
