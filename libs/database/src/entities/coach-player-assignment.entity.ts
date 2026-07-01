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
 * Get the training category for a coach role.
 *
 * Senior coach roles each own a fixed category. The YOUTH_COACH role
 * is the exception: its category is selected by the manager and stored
 * on `StaffEntity.trainedSkill` (so it can be switched freely). Callers
 * that need the runtime category for a youth coach should look at
 * `staff.trainedSkill` directly, not this helper.
 */
export function getTrainingCategoryForRole(role: StaffRole): string | null {
    const map: Record<StaffRole, string | null> = {
        [StaffRole.HEAD_COACH]: 'tactics',
        [StaffRole.FITNESS_COACH]: 'physical',
        [StaffRole.PSYCHOLOGY_COACH]: 'mental',
        [StaffRole.TECHNICAL_COACH]: 'technical',
        [StaffRole.SET_PIECE_COACH]: 'setPieces',
        [StaffRole.GOALKEEPER_COACH]: 'goalkeeper',
        // Youth coach has no role-fixed category — the manager picks one
        // at runtime via `staff.trainedSkill`. Return null so callers
        // know to read it from the staff row instead.
        [StaffRole.YOUTH_COACH]: null,
        [StaffRole.TEAM_DOCTOR]: 'recovery',
    };
    return map[role] ?? 'technical';
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
