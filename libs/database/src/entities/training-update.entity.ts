import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { TeamEntity } from './team.entity';

export interface PlayerTrainingChange {
    playerId: string;
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

    @Column({ name: 'created_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    createdAt!: Date;
}
