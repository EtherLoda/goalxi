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
     *
     * The shape mirrors `lineupV2` (slot key → int player id) for type
     * compatibility with editor/seed paths that still write to the legacy
     * column. Use `Record<string, string | number>` to tolerate any
     * pre-migration rows the wipe didn't catch.
     */
    lineup!: Record<string, string | number>;

    @Column({ name: 'lineup_v2', type: 'jsonb', nullable: true })
    lineupV2?: Record<string, number>;

    @Column({ type: 'jsonb', nullable: true })
    instructions?: Record<string, any>;

    @Column({ type: 'jsonb', nullable: true })
    substitutions?: Array<{ minute: number; out: string | number; in: string | number }> | null;

    @Column({ name: 'substitutions_v2', type: 'jsonb', nullable: true })
    /**
     * Per-substitution trigger condition. `undefined` / missing means
     * `always` per the engine's contract (`shouldFire` in
     * `simulator/src/engine/match.engine.ts`). The wire path is
     * FE → `SubstitutionDto` (validates with `@IsEnum(EventCondition)`)
     * → `MatchService.normaliseSubstitutions` (forwards) → this column
     * (jsonb, accepts the extra field) → `simulation.processor.ts`
     * `mapInstructions` (reads `s.condition`).
     */
    substitutionsV2?: Array<{
      minute: number;
      out: number;
      in: number;
      condition?: string;
    }>;

    // tempo 列已于 2026-10-18 随「比赛节奏」这个维度一起删除
    // （迁移 1788000000060-DropTempoDimensions）。宽度和防线保留。

    @Column({ type: 'varchar', length: 10, default: 'balanced' })
    pitchWidth!: string;

    @Column({ type: 'varchar', length: 10, default: 'mid' })
    defensiveLine!: string;

    /**
     * 球队战术（`TeamTacticCode`，见 `constants/team-tactics.constants.ts`）。
     *
     * `NULL` = 不选战术 = 引擎的中性打法，与引入这个字段之前逐位一致。
     * 存字符串而不是 PG enum：战术代码可能会增加 / 改名，enum 迁移在
     * PG 16 上要做整套 swap-type 动作（见 1724000000000 那个迁移），
     * 而这一列的读取方会自己容错未知值（引擎拿到未知代码时解析成中性风格）。
     *
     * 写入时 API 已经用 `checkTacticRequirement` 校验过阵型，所以这里不
     * 需要再存"是否满足"——不满足的提交根本不会落库。
     */
    @Column({ name: 'team_tactic', type: 'varchar', length: 20, nullable: true })
    teamTactic?: string | null;

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
