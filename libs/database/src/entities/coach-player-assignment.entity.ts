import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { StaffEntity, StaffRole } from './staff.entity';
import { PlayerEntity } from './player.entity';

@Entity('coach_player_assignment')
@Unique(['coachId', 'playerId'])
export class CoachPlayerAssignmentEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_coach_player_assignment_id' })
    id!: string;

    @Column({ name: 'coach_id', type: 'uuid' })
    coachId!: string;

    @ManyToOne(() => StaffEntity)
    @JoinColumn({ name: 'coach_id' })
    coach?: StaffEntity;

    @Column({ name: 'player_id', type: 'uuid' })
    playerId!: string;

    @ManyToOne(() => PlayerEntity)
    @JoinColumn({ name: 'player_id' })
    player?: PlayerEntity;

    @Column({ name: 'training_category', type: 'varchar', length: 50 })
    trainingCategory!: string;

    @Column({ name: 'assigned_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    assignedAt!: Date;
}

/**
 * Get the training category for a coach role
 */
export function getTrainingCategoryForRole(role: StaffRole): string {
    const map: Record<StaffRole, string> = {
        [StaffRole.HEAD_COACH]: 'tactics',
        [StaffRole.FITNESS_COACH]: 'physical',
        [StaffRole.PSYCHOLOGY_COACH]: 'mental',
        [StaffRole.TECHNICAL_COACH]: 'technical',
        [StaffRole.SET_PIECE_COACH]: 'setPieces',
        [StaffRole.GOALKEEPER_COACH]: 'goalkeeper',
        [StaffRole.TEAM_DOCTOR]: 'recovery',
    };
    return map[role] || 'technical';
}

/**
 * Get max players for a coach role
 */
export function getMaxPlayersForRole(role: StaffRole): number {
    if (role === StaffRole.TEAM_DOCTOR) {
        return 5; // 队医可以负责更多球员
    }
    return 3; // 其他教练最多带3人
}
