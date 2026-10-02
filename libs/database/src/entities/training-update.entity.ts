import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { TeamEntity } from './team.entity';

export interface PlayerTrainingChange {
    playerId: number;
    playerName: string;
    changes: {
        field: string;  // 'stamina', 'form', or 'skill:finishing' etc.
        oldValue: number;
        newValue: number;
    }[];
}

@Entity('training_update')
export class TrainingUpdateEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_training_update_id' })
    id!: string;

    @Column({ name: 'team_id', type: 'uuid' })
    teamId!: string;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'team_id' })
    team?: TeamEntity;

    @Column({ type: 'integer' })
    season!: number;

    @Column({ type: 'integer' })
    week!: number;

@Column({ name: 'player_updates', type: 'jsonb', default: [] })
    playerUpdates!: PlayerTrainingChange[];

    // `createdAt` is deliberately NOT redeclared here. It used to carry a
    // plain `@Column({ name: 'created_at', … })`, which shadowed the
    // inherited `@CreateDateColumn` from `AbstractEntity` in two ways:
    //
    //   - under `useDefineForClassFields` (implied by an ES2022 target) the
    //     subclass field would be defined as `undefined` and clobber the
    //     base value until TypeORM's insert hooks filled it in — TS2612;
    //   - the redeclaration dropped `nullable: false`, so the entity
    //     metadata disagreed with the actual column, which
    //     `1700000000024-AddTrainingUpdate` created as
    //     `created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP`.
    //
    // Inheriting the base column makes the entity match the schema.
}
