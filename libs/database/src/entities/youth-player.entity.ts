import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { PlayerAbility } from '../types/simulation-player';
import { PlayerSkills, PotentialTier } from './player.entity';
import { YouthTeamEntity } from './youth-team.entity';

@Entity('youth_player')
export class YouthPlayerEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_youth_player_id' })
    id!: string;

    /** 关联的母队成年队（用于晋升时创建 PlayerEntity） */
    @Column({ name: 'team_id', type: 'uuid' })
    teamId!: string;

    /** 关联的青训队 */
    @Column({ name: 'youth_team_id', type: 'uuid', nullable: true })
    youthTeamId?: string;

    @ManyToOne(() => YouthTeamEntity, { nullable: true })
    @JoinColumn({ name: 'youth_team_id' })
    youthTeam?: YouthTeamEntity;

    @Column()
    name!: string;

    @Column({ nullable: true })
    nationality?: string;

    @Column({ type: 'date' })
    birthday!: Date;

    @Column({ name: 'is_goalkeeper', default: false })
    isGoalkeeper!: boolean;

    @Column({ name: 'current_skills', type: 'jsonb' })
    currentSkills!: PlayerSkills;

    @Column({ name: 'potential_skills', type: 'jsonb' })
    potentialSkills!: PlayerSkills;

    @Column({ type: 'jsonb', nullable: true })
    abilities?: PlayerAbility[];

    /** 1=初始, 2=第一周, 3=第二周... */
    @Column({ name: 'reveal_level', default: 1 })
    revealLevel!: number;

    /** 已揭露的技能key数组 e.g. ['pace', 'strength', 'finishing', 'passing'] */
    @Column({ name: 'revealed_skills', type: 'jsonb', default: '[]' })
    revealedSkills!: string[];

    @Column({ name: 'potential_revealed', default: false })
    potentialRevealed!: boolean;

    @Column({ name: 'potential_tier', type: 'enum', enum: PotentialTier, nullable: true })
    potentialTier?: PotentialTier;

    @Column({ name: 'is_promoted', default: false })
    isPromoted!: boolean;

    @Column({ name: 'joined_at', type: 'date' })
    joinedAt!: Date;

    /**
     * Get player age in years (fractional)
     */
    get age(): number {
        if (!this.birthday) return 0;
        const diffMs = Date.now() - new Date(this.birthday).getTime();
        return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25) * 10) / 10;
    }
}
