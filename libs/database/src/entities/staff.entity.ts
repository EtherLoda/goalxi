import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { AbstractEntity } from './abstract.entity';

export enum StaffRole {
    HEAD_COACH = 'head_coach',
    FITNESS_COACH = 'fitness_coach',
    PSYCHOLOGY_COACH = 'psychology_coach',
    TECHNICAL_COACH = 'technical_coach',
    SET_PIECE_COACH = 'set_piece_coach',
    GOALKEEPER_COACH = 'goalkeeper_coach',
    TEAM_DOCTOR = 'team_doctor',
}

export enum StaffLevel {
    LEVEL_1 = 1,
    LEVEL_2 = 2,
    LEVEL_3 = 3,
    LEVEL_4 = 4,
    LEVEL_5 = 5,
}

@Entity('staff')
export class StaffEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_staff_id' })
    id!: string;

    @Column({ name: 'team_id', type: 'uuid' })
    teamId!: string;

    @Column()
    name!: string;

    @Column({ type: 'enum', enum: StaffRole })
    role!: StaffRole;

    @Column({ type: 'enum', enum: StaffLevel })
    level!: StaffLevel;

    /** 周薪 */
    @Column({ type: 'int' })
    salary!: number;

    /** 合同到期时间 */
    @Column({ name: 'contract_expiry', type: 'timestamp' })
    contractExpiry!: Date;

    /** 是否自动续约 */
    @Column({ name: 'auto_renew', default: true })
    autoRenew!: boolean;

    /** 合同是否生效中（赛季结束后未续约前 = false） */
    @Column({ name: 'is_active', default: true })
    isActive!: boolean;

    @Column({ nullable: true })
    nationality?: string;

    @Column({ type: 'jsonb', nullable: true })
    appearance?: Record<string, any>;

    /** 青训教练专属：每周汇报文本 */
    @Column({ name: 'youth_report', type: 'text', nullable: true })
    youthReport?: string;

    /** 专项教练训练的具体技能（如 finishing, passing 等），为空则训练该类别下随机技能 */
    @Column({ name: 'trained_skill', type: 'varchar', length: 50, nullable: true })
    trainedSkill?: string;
}
