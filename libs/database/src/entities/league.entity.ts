import { Uuid } from '../types/common.type';
import { AbstractEntity } from './abstract.entity';
import { Column, DeleteDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('league')
export class LeagueEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_league_id' })
    id!: Uuid;

    @Column({ type: 'varchar', nullable: false })
    name!: string;

    @Column({ type: 'int', nullable: false, default: 1 })
    tier!: number;

    @Column({ type: 'int', nullable: false, default: 1 })
    division!: number;

    @Column({ type: 'varchar', default: 'active' })
    status!: string;

    @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
    deletedAt?: Date | null;

    constructor(data?: Partial<LeagueEntity>) {
        super();
        Object.assign(this, data);
    }
}
