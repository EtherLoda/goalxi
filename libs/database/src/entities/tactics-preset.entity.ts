import {
    BaseEntity,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { TeamEntity } from './team.entity';

@Entity('tactics_preset')
@Index(['teamId', 'isDefault'])
export class TacticsPresetEntity extends BaseEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'team_id', type: 'uuid' })
    teamId!: string;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'team_id' })
    team?: TeamEntity;

    @Column({ type: 'varchar', length: 100 })
    name!: string;

    @Column({ name: 'is_default', type: 'boolean', default: false })
    isDefault!: boolean;

    @Column({ type: 'varchar', length: 10 })
    formation!: string;

    @Column({ name: 'lineup', type: 'jsonb' })
    /**
     * Position-slot -> player id.
     *
     * After the player.id uuid→int migration we cannot reconstruct the
     * uuid→int mapping for old presets, so this column is kept as a `never`
     * placeholder and new edits write to `lineupV2` (number ids). The
     * editor re-saves presets to populate `lineupV2`.
     */
    lineup!: Record<string, never>;

    @Column({ name: 'lineup_v2', type: 'jsonb', nullable: true })
    lineupV2?: Record<string, number>;

    @Column({ type: 'jsonb', nullable: true })
    instructions?: Record<string, any>;

    @Column({ name: 'substitutions', type: 'jsonb', nullable: true })
    /**
     * Legacy `out`/`in` were player uuid strings. Old rows stay empty
     * (cleared by the migration) and new saves populate `substitutionsV2`
     * with int player ids.
     */
    substitutions?: Array<{ minute: number; out: never; in: never }> | null;

    @Column({ name: 'substitutions_v2', type: 'jsonb', nullable: true })
    substitutionsV2?: Array<{ minute: number; out: number; in: number }>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    constructor(partial?: Partial<TacticsPresetEntity>) {
        super();
        Object.assign(this, partial);
    }
}
