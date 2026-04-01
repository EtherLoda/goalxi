import {
    BaseEntity,
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { YouthMatchEntity } from './youth-match.entity';
import { YouthTeamEntity } from './youth-team.entity';

@Entity('youth_match_tactics')
@Index(['youthMatchId', 'teamId'], { unique: true })
export class YouthMatchTacticsEntity extends BaseEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'youth_match_id', type: 'uuid' })
    youthMatchId!: string;

    @ManyToOne(() => YouthMatchEntity)
    @JoinColumn({ name: 'youth_match_id' })
    youthMatch?: YouthMatchEntity;

    @Column({ name: 'team_id', type: 'uuid' })
    teamId!: string;

    @ManyToOne(() => YouthTeamEntity)
    @JoinColumn({ name: 'team_id' })
    team?: YouthTeamEntity;

    /** 阵型，如 "4-4-2" */
    @Column()
    formation!: string;

    /** 位置Key → 球员ID */
    @Column({ type: 'jsonb' })
    lineup!: Record<string, string>;

    /** 换人指令 */
    @Column({ type: 'jsonb', nullable: true })
    substitutions?: Array<{
        minute: number;
        out: string;
        in: string;
    }>;

    /** 战术指令 */
    @Column({ type: 'jsonb', nullable: true })
    instructions?: Record<string, any>;

    @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt!: Date;
}
