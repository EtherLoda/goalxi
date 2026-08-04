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
    /**
     * Position-slot -> player id.
     *
     * After the player.id uuid→int migration we cannot reconstruct the
     * uuid→int mapping for old tactics rows, so this column was wiped and
     * left empty; users re-save tactics from the editor which populates the
     * new `lineupV2` field (number player ids). Code should read `lineupV2`
     * first; this field is kept only as a placeholder so old code that
     * destructures it doesn't crash.
     */
    lineup!: Record<string, never>;

    @Column({ name: 'lineup_v2', type: 'jsonb', nullable: true })
    lineupV2?: Record<string, number>;

    @Column({ type: 'jsonb', nullable: true })
    instructions?: Record<string, any>;

    @Column({ type: 'jsonb', nullable: true })
    substitutions?: Array<{ minute: number; out: never; in: never }> | null;

    @Column({ name: 'substitutions_v2', type: 'jsonb', nullable: true })
    substitutionsV2?: Array<{ minute: number; out: number; in: number }>;

    @Column({ type: 'varchar', length: 10, default: 'balanced' })
    tempo!: string;

    @Column({ type: 'varchar', length: 10, default: 'balanced' })
    pitchWidth!: string;

    @Column({ type: 'varchar', length: 10, default: 'mid' })
    defensiveLine!: string;

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
