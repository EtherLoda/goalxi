import { AbstractEntity } from './abstract.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('youth_league')
export class YouthLeagueEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column()
    name!: string;

    /** 母队联赛等级 (1-4)，对应 II1, II2, II3, II4 */
    @Column({ name: 'parent_tier', type: 'int' })
    parentTier!: number;

    @Column({ name: 'max_teams', type: 'int', default: 16 })
    maxTeams!: number;

    @Column({ type: 'varchar', default: 'active' })
    status!: string;
}
