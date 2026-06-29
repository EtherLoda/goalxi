import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { PlayerAbility } from '../types/simulation-player';
import { PlayerSkills } from './player.entity';
import { GAME_SETTINGS } from '../constants/game.constants';
import { currentGameDay } from '../utils/game-clock';
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

    /**
     * Absolute game-day on which this youth was created (see
     * `utils/game-clock`). Same semantics as `PlayerEntity.createdDay` so
     * promote() can copy it verbatim without any age math.
     */
    @Column({ name: 'created_day', type: 'int' })
    createdDay!: number;

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

    @Column({ name: 'potential_tier', type: 'varchar', length: 50, nullable: true })
    potentialTier?: string;

    @Column({ name: 'is_promoted', default: false })
    isPromoted!: boolean;

    @Column({ name: 'joined_at', type: 'date' })
    joinedAt!: Date;

    /** Days this youth has existed in the game world. */
    get daysAlive(): number {
        return currentGameDay() - this.createdDay;
    }

    get age(): number {
        return Math.floor(this.daysAlive / GAME_SETTINGS.DAYS_PER_YEAR);
    }

    getExactAge(): [number, number] {
        const total = this.daysAlive;
        const years = Math.floor(total / GAME_SETTINGS.DAYS_PER_YEAR);
        const days = total - years * GAME_SETTINGS.DAYS_PER_YEAR;
        return [years, days];
    }

    get fractionalAge(): number {
        return this.daysAlive / GAME_SETTINGS.DAYS_PER_YEAR;
    }
}
