export const GAME_SETTINGS = {
    /**
     * Length of ONE season-year, in weeks — **including the playoff
     * week**. The regular season occupies weeks `1 .. SEASON_LENGTH_WEEKS - 1`;
     * week `SEASON_LENGTH_WEEKS` is reserved for `PlayoffService`.
     *
     * `SeasonTransitionService` derives both from this:
     * `SEASON_LAST_WEEK = SEASON_LENGTH_WEEKS` (the playoff week) and
     * `PLAYOFF_TRIGGER_WEEK = SEASON_LENGTH_WEEKS - 1` (the last
     * regular week). `currentSeasonWeek` cycles on it too.
     *
     * ## Why 11 and not 10
     *
     * A 16-team double round-robin is 30 rounds. At
     * `ROUNDS_PER_WEEK = 3` that is exactly 10 regular weeks, so the
     * season-year is 10 + 1 playoff week = **11**. Ten would leave only
     * 9 regular weeks = 27 rounds, which a double round-robin cannot
     * produce.
     *
     * ## What this drives
     *
     * `DAYS_PER_YEAR` is derived from it, so this constant is also the
     * age denominator: `player.age = floor(daysAlive / DAYS_PER_YEAR)`
     * (`libs/database/src/entities/player.entity.ts:145`). Changing this
     * value re-bases every player's age instantly — see the
     * `noInternalNumbers`-style guard in `game.constants.spec.ts` and
     * the re-seed requirement in the season-compression plan.
     */
    SEASON_LENGTH_WEEKS: 11,
    DAYS_PER_WEEK: 7,

    /** Regular-season weeks. `SEASON_LENGTH_WEEKS - 1`; the last week is playoffs. */
    get REGULAR_SEASON_WEEKS() {
        return this.SEASON_LENGTH_WEEKS - 1;
    },

    /** One season-year in days. The unit every contract length and week math uses. */
    get SEASON_LENGTH_DAYS() {
        return this.SEASON_LENGTH_WEEKS * this.DAYS_PER_WEEK;
    },

    /**
     * League fixtures per match-week. A round-robin round is one
     * matchday (every team plays once), so this is also "how many
     * matchdays each team plays per week".
     *
     * `REGULAR_SEASON_WEEKS * ROUNDS_PER_WEEK` must equal the total
     * rounds of a double round-robin for the season to end exactly on
     * the last regular week. For 16 teams: 10 * 3 = 30. Pinned by the
     * arithmetic invariant spec — if you change one of these, that
     * spec fails and tells you the season no longer adds up.
     */
    ROUNDS_PER_WEEK: 3,

    /**
     * Which weekdays of the week league fixtures fall on, as offsets
     * from Monday (= 0). `[1, 3, 5]` = Tuesday, Thursday, Saturday.
     *
     * Length must equal `ROUNDS_PER_WEEK`. Entry `i` is the day of the
     * `i`-th round within the week, so `round % ROUNDS_PER_WEEK` indexes
     * this array.
     *
     * ## Why not Sunday
     *
     * `league-award.service.ts` runs Sunday 00:00 gated on the final
     * regular week being complete. A Sunday-06:00 final matchday would
     * finish 6 h *after* that cron had already evaluated, and the season
     * number rolls over on the following Monday — so the award would
     * never be granted. The invariant is really "the final matchday must
     * complete before the Sunday 00:00 inside `PLAYOFF_TRIGGER_WEEK`";
     * Friday or Saturday both satisfy it, Saturday with the most margin.
     *
     * ## Why not Monday
     *
     * Monday 00:00 already carries the finance settlement, the senior
     * decline tick, playoff generation and season start.
     *
     * Spacing for `[1, 3, 5]` is 2 / 2 / 3 days — the most even
     * distribution achievable at three fixtures per week.
     */
    MATCH_DAY_OFFSETS: [1, 3, 5] as const,

    /**
     * Timezone every `@Cron` in this workspace must be pinned to.
     *
     * `@nestjs/schedule` passes its options straight through to
     * `CronJob.from`, which defaults to the **server's local timezone**.
     * Every cron in `settlement/src/scheduler/` is written and commented
     * as UTC ("Every Monday at 00:00 UTC"), and the whole season/week
     * grid (`currentSeasonWeek`) is anchored on a UTC-Monday boundary —
     * so on a non-UTC host the daily/weekly triggers drift by up to a day
     * and can fire on the wrong weekday.
     *
     * It happened to work because `settlement/Dockerfile` uses
     * `node:20-alpine` (UTC) and the compose file sets no `TZ`. That is
     * an undocumented, load-bearing assumption. Pass it explicitly:
     *
     *     @Cron('0 0 0 * * 1', { timeZone: GAME_SETTINGS.CRON_TIME_ZONE })
     */
    CRON_TIME_ZONE: 'UTC',
    get DAYS_PER_YEAR() {
        return this.SEASON_LENGTH_WEEKS * this.DAYS_PER_WEEK;
    },
    get MS_PER_YEAR() {
        return this.DAYS_PER_YEAR * 24 * 60 * 60 * 1000;
    },

    // Match Settings
    MATCH_STREAMING_SPEED: 1.0,  // 1x = real-time (90 min = 90 min)
    MATCH_TACTICS_DEADLINE_MINUTES: 10,  // Tactics lock 10 minutes before match
    MATCH_POLLING_INTERVAL_MINUTES: 5,

    /**
     * Kickoff hour (UTC) for every senior match — both league
     * (`MATCH_DAY_OFFSETS` cadence) and cup (Tue + Thu cadence).
     * 6:00 UTC = 14:00 in China time, the game audience's afternoon
     * slot. Originally 13:00 UTC (= 21:00 China evening); changed to
     * 6:00 UTC on 2026-08-18 to give global audiences a more
     * balanced window (Europe morning, Asia afternoon, US
     * late-evening). Cup scheduler MUST import this same value
     * to stay aligned with the league cadence.
     */
    MATCH_KICKOFF_HOUR_UTC: 6,

    // Match Duration
    MATCH_FIRST_HALF_MINUTES: 45,
    MATCH_SECOND_HALF_MINUTES: 45,
    MATCH_HALF_TIME_MINUTES: 15,
    MATCH_INJURY_TIME_MIN: 1,
    MATCH_INJURY_TIME_MAX: 5,

    // Extra Time (Tournament) - No injury time
    MATCH_EXTRA_TIME_FIRST_HALF_MINUTES: 15,
    MATCH_EXTRA_TIME_SECOND_HALF_MINUTES: 15,
    MATCH_EXTRA_TIME_BREAK_MINUTES: 5,

    /**
     * Injury value threshold for the player-side `injuryState` flag.
     *
     * - `currentInjuryValue <= INJURY_MINOR_VALUE_THRESHOLD` →
     *   `injuryState = 'minor'` (player can keep playing at 95%
     *   ability per `calculateInjuryPenalty` in
     *   `libs/database/src/types/simulation-player.ts`).
     * - `currentInjuryValue >  INJURY_MINOR_VALUE_THRESHOLD` →
     *   `injuryState = 'severe'` (cannot play).
     *
     * Calibrated 2026-08-05 to align with the simulator's mild
     * injury value range (20-55) — most mild injuries land in the
     * "minor / playable" bucket, but a few cross the threshold
     * (e.g. head/ligament mild at the upper end) and get treated
     * as severe. The cutoff value is checked from TWO call sites
     * (simulator on write, recovery cron on daily tick) — see
     * `injury-recovery.service.ts` and `simulation.processor.ts`.
     * If you change this value, update the migration comment in
     * `1726000000000-DropInjuryRedundantColumns` for context.
     */
    INJURY_MINOR_VALUE_THRESHOLD: 30,
};
