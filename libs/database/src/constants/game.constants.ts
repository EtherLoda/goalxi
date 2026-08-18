export const GAME_SETTINGS = {
    SEASON_LENGTH_WEEKS: 16,
    DAYS_PER_WEEK: 7,
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
     * (Wed + Sat cadence) and cup (Tue + Thu cadence). 6:00 UTC
     * = 14:00 in China time, the game audience's afternoon slot.
     * Originally 13:00 UTC (= 21:00 China evening); changed to
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
