import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { PlayerAbility } from '../types/simulation-player';
import { PlayerSkills, PotentialTier } from './player.entity';

export interface ScoutCandidatePlayerData {
    name: string;
    birthday: Date;
    nationality: string;
    isGoalkeeper: boolean;
    currentSkills: PlayerSkills;
    potentialSkills: PlayerSkills;
    abilities?: PlayerAbility[];
    potentialTier?: PotentialTier;
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

    @Column({ type: 'jsonb' })
    playerData!: ScoutCandidatePlayerData;

    /** 赛季末自动清除 */
    @Column({ name: 'expires_at', type: 'timestamp' })
    expiresAt!: Date;
}
