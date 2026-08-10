import { TeamEntity } from './team.entity';
import { LeagueEntity } from './league.entity';
import { AbstractEntity } from './abstract.entity';
import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { WeatherType } from './weather.entity';
import { StadiumEntity } from './stadium.entity';

export enum MatchStatus {
    SCHEDULED = 'scheduled',
    TACTICS_LOCKED = 'tactics_locked',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
}

export enum MatchType {
    LEAGUE = 'league',
    CUP = 'cup',
    TOURNAMENT = 'tournament',
    FRIENDLY = 'friendly',
    NATIONAL_TEAM = 'national_team',
    PLAYOFF = 'playoff',  // 升降级附加赛
}

@Entity('match')
@Index(['leagueId', 'season', 'week'])
@Index(['homeTeamId'])
@Index(['awayTeamId'])
export class MatchEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'league_id', type: 'uuid' })
    leagueId!: string | null;

    @ManyToOne(() => LeagueEntity)
    @JoinColumn({ name: 'league_id' })
    league?: LeagueEntity;

    @Column({ type: 'int' })
    season!: number;

    @Column({ type: 'int' })
    week!: number;

    /** Round within the week (1 or 2 for double matchweeks) */
    @Column({ type: 'int', name: 'round', nullable: true })
    round?: number;

    @Column({ name: 'home_team_id', type: 'uuid' })
    homeTeamId!: string;

    @ManyToOne(() => TeamEntity, { eager: true })
    @JoinColumn({ name: 'home_team_id' })
    homeTeam?: TeamEntity;

    @Column({ name: 'away_team_id', type: 'uuid' })
    awayTeamId!: string;

    @ManyToOne(() => TeamEntity, { eager: true })
    @JoinColumn({ name: 'away_team_id' })
    awayTeam?: TeamEntity;

    @Column({ name: 'scheduled_at', type: 'timestamp' })
    scheduledAt!: Date;

    @Column({ type: 'varchar', length: 20, default: MatchStatus.SCHEDULED })
    status!: MatchStatus;

    @Column({ type: 'varchar', length: 30, default: MatchType.LEAGUE })
    type!: MatchType;

    @Column({ name: 'home_score', type: 'int', nullable: true })
    homeScore?: number;

    @Column({ name: 'away_score', type: 'int', nullable: true })
    awayScore?: number;

    @Column({ name: 'simulation_completed_at', type: 'timestamp', nullable: true })
    simulationCompletedAt?: Date;

    /**
     * [RFC sim-worker-lock] Set by SimulationProcessor via an atomic UPDATE
     * before running the engine; cleared in a try/finally. Acts as a
     * per-match lease so concurrent jobs (e.g. scheduler 3's recovery branch
     * re-enqueuing while the first worker is still computing) cannot both
     * bulk-insert events for the same match. See migration
     * `1723500000000-AddSimulationStartedAt`.
     */
    @Column({ name: 'simulation_started_at', type: 'timestamp', nullable: true })
    simulationStartedAt?: Date | null;

    @Column({ name: 'tactics_locked_at', type: 'timestamp', nullable: true })
    tacticsLockedAt?: Date;

    @Column({ name: 'actual_end_time', type: 'timestamp', nullable: true })
    actualEndTime?: Date;

    @Column({ name: 'tactics_locked', type: 'boolean', default: false })
    tacticsLocked!: boolean;

    @Column({ name: 'home_forfeit', type: 'boolean', default: false })
    homeForfeit!: boolean;

    @Column({ name: 'away_forfeit', type: 'boolean', default: false })
    awayForfeit!: boolean;

    @Column({ name: 'started_at', type: 'timestamp', nullable: true })
    startedAt?: Date;

    @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
    completedAt?: Date;

    /**
     * [B5] Set by `MatchLiveScheduler.processLineupBroadcasts` right after
     * the lineup is emitted to subscribed clients. The scheduler filters
     * `WHERE lineup_broadcast_at IS NULL` to avoid re-broadcasting the
     * same lineup every 30s for the full 5-minute pre-kickoff window.
     * Nullable so existing rows are treated as "not yet broadcast".
     */
    @Column({ name: 'lineup_broadcast_at', type: 'timestamptz', nullable: true })
    lineupBroadcastAt?: Date | null;

    /**
     * [B4] Set by `MatchLiveScheduler.processMatchCompletions` right
     * after the match_end event is emitted. The scheduler filters
     * `WHERE match_end_broadcast_at IS NULL` so a `COMPLETED` match is
     * only broadcast once per its lifetime (and an `IN_PROGRESS` race
     * where two cron ticks see the same `actualEndTime` collapse to a
     * single broadcast via the row-level UPDATE).
     */
    @Column({ name: 'match_end_broadcast_at', type: 'timestamptz', nullable: true })
    matchEndBroadcastAt?: Date | null;

    @Column({ name: 'first_half_injury_time', type: 'int', nullable: true })
    firstHalfInjuryTime?: number;

    @Column({ name: 'second_half_injury_time', type: 'int', nullable: true })
    secondHalfInjuryTime?: number;

    @Column({ name: 'has_extra_time', type: 'boolean', default: false })
    hasExtraTime!: boolean;

    @Column({ name: 'requires_winner', type: 'boolean', default: false })
    requiresWinner!: boolean;

    @Column({ name: 'extra_time_first_half_injury', type: 'int', nullable: true })
    extraTimeFirstHalfInjury?: number;

    @Column({ name: 'extra_time_second_half_injury', type: 'int', nullable: true })
    extraTimeSecondHalfInjury?: number;

    @Column({ name: 'has_penalty_shootout', type: 'boolean', default: false })
    hasPenaltyShootout!: boolean;

    /** 升降级附加赛时：低级联赛ID（高级联赛ID用 leagueId） */
    @Column({ name: 'lower_league_id', type: 'uuid', nullable: true })
    lowerLeagueId?: string | null;

    /**
     * `processAfterPlayoffsComplete` (settlement's
     * `SeasonTransitionService.processPlayoffResultsAndSwap` cron)
     * uses this column as the "already swapped" marker so re-running
     * the swap is a no-op. Nullable; null means "swap not yet applied",
     * non-null is the timestamp the swap ran. A swap is a
     * `swapTeamLeague(upperTeamId, lowerTeamId, …)` call that mutates
     * `team.leagueId` for both teams — running it twice would un-swap
     * them. This column makes the operation idempotent across cron
     * re-runs and across the seasonal transition (the column lives on
     * the playoff match row, not on the team, so the next season's
     * playoffs naturally start fresh).
     */
    @Column({ name: 'playoff_swapped_at', type: 'timestamptz', nullable: true })
    playoffSwappedAt?: Date | null;

    /** 比赛天气 */
    @Column({ name: 'weather', type: 'varchar', length: 20, nullable: true })
    weather?: WeatherType;

    /** 上座人数(主场比赛)。由 `MatchCompletionService.calculateStadiumRevenue`
     *  在比赛结算时算好并回写;同一次结算会再发出 `attendance_announcement`
     *  事件给前端做行内展示。该列是 Stadium 页面计算赛季平均上座率、
     *  `MatchEngine` 启动时读取并向 minute-0 注入观众数的单一来源。
     *  历史迁移(`AddMatchAttendance1719200000000`) 之前的旧比赛该列
     *  为 null,前端走 `DEFAULT_FILL_RATE = 0.7` 兜底。 */
    @Column({ name: 'attendance', type: 'int', nullable: true })
    attendance?: number | null;

    /**
     * [RFC 0001] When this is non-null, the match is a youth-league match
     * (taken over from the dropped `youth_match` table). The senior
     * `match` table now serves both senior and youth fixtures, with this
     * column as the discriminator. Combined with the `type` column above
     * which already includes `'youth_league'`, this is fully redundant;
     * we keep `youthLeagueId` to preserve the 1:1 mapping to the
     * `youth_league` table and to make JOINs cheap.
     */
    @Column({ name: 'youth_league_id', type: 'uuid', nullable: true })
    youthLeagueId?: string | null;

    @ManyToOne(() => require('./youth-league.entity').YouthLeagueEntity, {
      nullable: true,
    })
    @JoinColumn({ name: 'youth_league_id' })
    youthLeague?: any;

    /**
     * Venue where this match is played. For home/away league matches this is
     * the home team's stadium (set by the match scheduler / seed); for
     * neutral-venue fixtures (cup finals, all-star games) it can be any
     * stadium row. Nullable so historic matches pre-dating the column
     * remain valid even if their team has since been deleted.
     */
    @Column({ name: 'stadium_id', type: 'uuid', nullable: true })
    stadiumId?: string | null;

    @ManyToOne(() => StadiumEntity, { nullable: true })
    @JoinColumn({ name: 'stadium_id' })
    stadium?: StadiumEntity;

    constructor(partial?: Partial<MatchEntity>) {
        super();
        Object.assign(this, partial);
    }
}
