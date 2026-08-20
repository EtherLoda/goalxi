/**
 * Derive the in-game minute for a live match from the wall-clock
 * position relative to the sim's published timing anchors.
 *
 * Background
 * ──────────
 * The previous implementation read `currentMinute` off the latest
 * revealed event's `minute` column. That's the "max revealed"
 * minute, which is right only when events are revealed continuously.
 * In quiet bands of the match — the half-time break, the second-half
 * injury band, and 5-minute gaps between snapshots in 2H regulation
 * — the on-screen clock got stuck even though real time kept moving.
 * The user-visible symptom was "live page shows 90' for a long
 * stretch during 2H injury time while events at 91', 92' trickle in
 * one at a time."
 *
 * The sim already publishes a per-event `eventScheduledTime` that
 * maps an in-game minute to a real-world instant relative to
 * `match.scheduledAt` (the kickoff). The mapping encodes the half-
 * time break and the per-half injury time. Inverting the mapping
 * gives a deterministic "what in-game minute corresponds to
 * wall-clock T?" answer for any T:
 *
 *   1H regulation      : minutes   1..45     →  kickoff + 1..45 min
 *   1H injury          : minutes  46..45+N1  →  kickoff + 46..45+N1 min
 *   1H whistle         : minute  45+N1      →  kickoff + 45+N1 min
 *   <HT break>                                kickoff + 45+N1 .. 60
 *   2H kickoff         : minute  46          →  kickoff + 60 min
 *   2H regulation      : minutes  47..90     →  kickoff + 62..105 min
 *   2H injury          : minutes  91..90+N2  →  kickoff + 106..105+N2 min
 *   2H whistle (FT)    : minute  90+N2      →  kickoff + 105+N2 min
 *
 * The in-game → real-world offset is 0 in 1H and 15 (= HT) in 2H.
 * Inverting: `in_game_minute = T - 15` for any 2H-band wall-clock
 * instant, clamped to [46, 90+N2]. The 1H band is `in_game_minute =
 * T` directly. The half-time break freezes the clock at 45+N1.
 *
 * Why the previous MAX(minute) was wrong
 * ─────────────────────────────────────
 *   - **HT break / 2H injury / quiet 2H regulation gaps**: events
 *     are reveal-sparse in those bands. The on-screen minute
 *     jumped only when a new event landed, instead of advancing
 *     smoothly with wall-clock. Real broadcasts advance the clock
 *     every second; this function makes our FE match.
 *   - **Preprocessor lag**: even in regular play, the preprocessor
 *     ticks every 5s; between two events the in-game clock should
 *     already show the minute that wall-clock has reached, not the
 *     minute of the last event that happened to be revealed.
 *
 * Edge case: a match whose sim hasn't run yet has `firstHalfInjuryTime`
 * and `secondHalfInjuryTime` as `null`. We default them to 0 so the
 * clock advances smoothly even before the sim populates them; the
 * next sim completion will overwrite the field and the formula
 * re-aligns automatically.
 */
const HT_BREAK_MIN = 15;
const REG_HALF_MIN = 45;
const SECOND_HALF_START_REAL_MIN = 60; // 45 + 15
const SECOND_HALF_OFFSET = 15; // 2H event realWorldOffset = minute + 15

export interface CurrentMinuteMatchFields {
  /** Real-world kickoff instant — `eventScheduledTime` of minute 0. */
  scheduledAt: Date;
  /** Sim's per-half injury minutes, possibly null until sim runs. */
  firstHalfInjuryTime?: number | null;
  secondHalfInjuryTime?: number | null;
  extraTimeFirstHalfInjury?: number | null;
  extraTimeSecondHalfInjury?: number | null;
  hasExtraTime?: boolean;
}

/**
 * Compute the in-game minute at a given real-world instant.
 *
 * @param match   Match entity (or just the timing fields)
 * @param now     Wall-clock instant — defaults to `Date.now()`
 * @returns       Integer in-game minute (0 if pre-kickoff).
 *                Clamps to the match's published boundaries
 *                (FT for non-ET, ET FT for ET matches).
 */
export function computeCurrentInGameMinute(
  match: CurrentMinuteMatchFields,
  now: number = Date.now(),
): number {
  const N1 = match.firstHalfInjuryTime ?? 0;
  const N2 = match.secondHalfInjuryTime ?? 0;
  const ET_N1 = match.extraTimeFirstHalfInjury ?? 0;
  const ET_N2 = match.extraTimeSecondHalfInjury ?? 0;
  const hasET = !!match.hasExtraTime;

  const kickoffMs = new Date(match.scheduledAt).getTime();
  const elapsedMin = (now - kickoffMs) / 60_000;

  // Pre-kickoff: pin at 0.
  if (elapsedMin < 0) return 0;

  // 1H regulation (1..45) + 1H injury (46..45+N1). The 1H whistle
  // is at minute 45+N1, real-world 45+N1. The mapping is 1:1 in
  // this band (realWorldOffset = eventMinute for 1H events).
  const h1EndMinute = REG_HALF_MIN + N1;
  if (elapsedMin <= h1EndMinute) {
    return clamp(Math.floor(elapsedMin), 0, h1EndMinute);
  }

  // Half-time break. Real broadcasts freeze the clock on the
  // whistle minute (e.g. 45+3 = 48') until the 2H kickoff event
  // at real-world 60 min. The kickoff instant itself is the
  // boundary — at T=60 the 2H kickoff event fires and the clock
  // jumps from 45+N1 to 46; we use a strict `< 60` so T=60 falls
  // into the 2H branch below.
  if (elapsedMin < SECOND_HALF_START_REAL_MIN) {
    return h1EndMinute;
  }

  // 2H regulation (46..90) + 2H injury (91..90+N2). The 2H kickoff
  // is at minute 46, real-world 60 — the 1-min gap between T=60
  // (kickoff instant) and T=61 (the next event) still displays
  // minute 46 because the broadcast convention counts whole
  // minutes. The offset is HT_BREAK_MIN: realWorldOffset =
  // eventMinute + 15 for 2H events. Inverting:
  //   in_game_minute = elapsedMin - 15
  // clamped to [46, 90+N2]. The 2H whistle is the last event at
  // minute 90+N2; after that the clock stays on 90+N2.
  const h2EndMinute = 90 + N2;
  if (elapsedMin <= 105 + N2) {
    return clamp(
      Math.max(46, Math.floor(elapsedMin - SECOND_HALF_OFFSET)),
      46,
      h2EndMinute,
    );
  }

  if (!hasET) {
    return h2EndMinute;
  }

  // Extra time. The sim's per-event realWorldOffset formulas for
  // the ET bands overlap the 2H whistle in non-obvious ways (the
  // ET 1H kickoff event has realWorldOffset = 105 regardless of N2,
  // which can fall BEFORE the 2H whistle at 105+N2; ET 2H has its
  // own `(90+HT+15+N2+ET_BREAK)` offset that depends on N2). We
  // approximate the broadcast clock for ET matches with the same
  // `T-15` offset as 2H, but pin the start of ET 1H at the
  // earliest possible wall-clock (the 2H end + 5-min ET break =
  // 105+N2) and freeze at 2H FT until ET 1H kicks off. This gets
  // the clock advancing through ET instead of getting stuck; the
  // edge case where 2H injury > 0 can still leave the clock
  // lagging the sim by a few seconds, but the per-tick
  // preprocessor will catch up once the next ET 1H event lands.
  //
  // For full precision (e.g. distinguishing 90+3' from 91' in the
  // UI), the next iteration should pull the actual ET 1H kickoff
  // event's eventScheduledTime out of the gateway and use it as
  // the anchor — the same way 2H kickoff is used as the anchor
  // for the 2H band.
  const etBreakStart = 105 + N2;
  const etBreakEnd = 110 + N2;
  if (elapsedMin <= etBreakEnd) {
    return h2EndMinute;
  }
  // ET 1H approximation. In-game minute = elapsedMin - 15,
  // clamped to [91, 105+ET_N1].
  if (elapsedMin <= 120 + ET_N1) {
    return clamp(
      Math.max(91, Math.floor(elapsedMin - SECOND_HALF_OFFSET)),
      91,
      105 + ET_N1,
    );
  }
  // ET HT break (5 min). Freeze at 105+ET_N1.
  if (elapsedMin <= 125 + ET_N1) {
    return 105 + ET_N1;
  }
  // ET 2H approximation. Same `T-15` offset.
  if (elapsedMin <= 140 + ET_N2) {
    return clamp(
      Math.max(106, Math.floor(elapsedMin - SECOND_HALF_OFFSET)),
      106,
      120 + ET_N2,
    );
  }
  return 120 + ET_N2;
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
