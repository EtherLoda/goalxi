import {
    BaseEntity,
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { MatchEntity } from './match.entity';
import { TeamEntity } from './team.entity';
import { TacticsPresetEntity } from './tactics-preset.entity';

@Entity('match_tactics')
export class MatchTacticsEntity extends BaseEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'match_id', type: 'uuid' })
    matchId!: string;

    @ManyToOne(() => MatchEntity)
    @JoinColumn({ name: 'match_id' })
    match?: MatchEntity;

    @Column({ name: 'team_id', type: 'uuid' })
    teamId!: string;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'team_id' })
    team?: TeamEntity;

    @Column({ name: 'preset_id', type: 'uuid', nullable: true })
    presetId?: string;

    @ManyToOne(() => TacticsPresetEntity)
    @JoinColumn({ name: 'preset_id' })
    preset?: TacticsPresetEntity;

    @Column({ type: 'varchar', length: 10 })
    formation!: string;

    @Column({ type: 'jsonb' })
    lineup!: Array<{ position: string; playerId: string }>;

    @Column({ type: 'jsonb', nullable: true })
    instructions?: Record<string, any>;

    @Column({ type: 'jsonb', nullable: true })
    substitutions?: Array<{ minute: number; out: string; in: string }>;

    @Column({ name: 'submitted_at', type: 'timestamp' })
    submittedAt!: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    constructor(partial?: Partial<MatchTacticsEntity>) {
        super();
        Object.assign(this, partial);
    }
}
