import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { PlayerAbility } from '../types/simulation-player';
import { PlayerSkills } from './player.entity';
import { SpecialtyTier } from '../constants/specialty-codes';

export interface ScoutCandidatePlayerData {
    name: string;
    createdDay: number;
    nationality: string;
    isGoalkeeper: boolean;
    /** Formation slot the candidate plays (ST/CF/LW/RW/AM/CM/DM/LB/RB/CB/GK). */
    position?: string;
    currentSkills: PlayerSkills;
    potentialSkills: PlayerSkills;
    /** v2 core specialty (preferred over `abilities` for new code). */
    coreSpecialty?: string | null;
    coreSpecialtyTier?: SpecialtyTier;
    /** Legacy v1 single-ability list. Mirrors `coreSpecialty` for the
     * migration window; new callers should read `coreSpecialty`. */
    abilities?: PlayerAbility[];
    potentialTier?: string;
    potentialRevealed: boolean;
    revealedSkills: string[];
    joinedAt: Date;
}

@Entity('scout_candidate')
export class ScoutCandidateEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_scout_candidate_id' })
    id!: string;

    @Column({ name: 'team_id', type: 'uuid' })
    teamId!: string;

    @Column({ name: 'player_data', type: 'jsonb' })
    playerData!: ScoutCandidatePlayerData;

    /** 赛季末自动清除 */
    @Column({ name: 'expires_at', type: 'timestamp' })
    expiresAt!: Date;
}
