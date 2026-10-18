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
    /**
     * Same wire shape as `MatchTacticsEntity.substitutionsV2` — the
     * engine reads both columns via `simulation.processor.ts`.
     * `condition` is optional; `undefined` means `always`.
     */
    substitutionsV2?: Array<{
      minute: number;
      out: number;
      in: number;
      condition?: string;
    }>;

    /**
     * The three tactical dimensions plus the team tactic, mirroring
     * `MatchTacticsEntity` column-for-column (same quoted camelCase column
     * names, same defaults). A preset is a complete tactical snapshot, so
     * `MatchService.submitTactics` copies these straight onto the match row
     * when the request names a `presetId`.
     */
    @Column({ type: 'varchar', length: 10, default: 'balanced' })
    tempo!: string;

    @Column({ type: 'varchar', length: 10, default: 'balanced' })
    pitchWidth!: string;

    @Column({ type: 'varchar', length: 10, default: 'mid' })
    defensiveLine!: string;

    /**
     * 球队战术（`TeamTacticCode`）。`NULL` = 不选战术，与 `match_tactics`
     * 同义；应用这个预设会把比赛战术一并清空。
     *
     * 存字符串而不是 PG enum，理由同 `MatchTacticsEntity.teamTactic`。
     */
    @Column({ name: 'team_tactic', type: 'varchar', length: 20, nullable: true })
    teamTactic?: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    constructor(partial?: Partial<TacticsPresetEntity>) {
        super();
        Object.assign(this, partial);
    }
}
