import { AbstractEntity } from './abstract.entity';
import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { YouthLeagueEntity } from './youth-league.entity';
import { TeamEntity } from './team.entity';

@Entity('youth_team')
export class YouthTeamEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    /** 关联的母队成年队 */
    @Column({ name: 'team_id', type: 'uuid' })
    teamId!: string;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'team_id' })
    team?: TeamEntity;

    /** 所属青训联赛 */
    @Column({ name: 'youth_league_id', type: 'uuid' })
    youthLeagueId!: string;

    @ManyToOne(() => YouthLeagueEntity)
    @JoinColumn({ name: 'youth_league_id' })
    youthLeague?: YouthLeagueEntity;

    @Column()
    name!: string;
}
