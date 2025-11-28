import { Uuid } from '@/common/types/common.type';
import { AbstractEntity } from '@/database/entities/abstract.entity';
import { UserEntity } from '@/api/user/entities/user.entity';
import { LeagueEntity } from '@/api/league/entities/league.entity';
import type { FinanceEntity } from '@/api/finance/entities/finance.entity';
import { Column, DeleteDateColumn, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity('team')
export class TeamEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_team_id' })
    id!: Uuid;

    @Column({ name: 'user_id', type: 'uuid', unique: true, nullable: false })
    userId: string;

    @OneToOne(() => UserEntity)
    @JoinColumn({ name: 'user_id' })
    user: UserEntity;

    @OneToOne('FinanceEntity', (finance: any) => finance.team)
    finance: FinanceEntity;

    @Column({ name: 'league_id', type: 'uuid', nullable: true })
    leagueId: string | null;

    @ManyToOne(() => LeagueEntity)
    @JoinColumn({ name: 'league_id' })
    league: LeagueEntity;

    @Column({ type: 'varchar', nullable: false })
    name: string;

    @Column({ name: 'logo_url', type: 'varchar', default: '' })
    logoUrl: string;

    @Column({ name: 'jersey_color_primary', type: 'varchar', default: '#FF0000' })
    jerseyColorPrimary: string;

    @Column({ name: 'jersey_color_secondary', type: 'varchar', default: '#FFFFFF' })
    jerseyColorSecondary: string;

    @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
    deletedAt: Date | null;

    constructor(data?: Partial<TeamEntity>) {
        super();
        Object.assign(this, data);
    }
}
