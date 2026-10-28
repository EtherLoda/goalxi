/**
 * match-completion.ts — how a finished match actually ended, read from its
 * event stream.
 *
 * The report chrome used to hard-code `FT` for every completed match. That is
 * wrong for two knockout-only cases, and both are recoverable from the events
 * without a schema change:
 *
 * - **Extra time.** The engine's regulation halves stop at 90', but the
 *   knockout path keeps going to 105' + 120'. Every event from the ET kickoff
 *   onwards carries `data.period` prefixed `extra_time…`
 *   (`simulator/src/engine/match.engine.ts` `simulateExtraTime`), which is a
 *   far more reliable marker than the minute: regular 2H stoppage also runs
 *   past `minute: 90` (`simulateMinute(90 + i, 'second_half_injury', true)`),
 *   so `minute > 90` would misfire on any 90'+N goal.
 * - **Penalty shootout.** `MatchEngine.simulatePenaltyShootout()` emits a
 *   closing `full_time` event with `data.isPenalty: true`, and — importantly —
 *   it overwrites `homeScore` / `awayScore` with the shootout tally before the
 *   result is persisted. So `match.homeScore` / `match.awayScore` hold the
 *   spot-kick score (kept on purpose: the standings / ELO / stadium win-rate
 *   bookkeeping in `match-completion.service.ts` needs a decisive scoreline).
 *
 * Because of that overwrite, the report hero has to read two numbers out of
 * the events to show the football result and the shootout separately:
 *
 *   1. The last `full_time` **without** `isPenalty` — the score at the final
 *      whistle (120' for a cup tie that played extra time).
 *   2. The `full_time` **with** `isPenalty: true` — the shootout tally.
 *
 * The hero then renders `1 · 1` with a `PENS 4–3` chip, instead of the bare
 * `4 · 3` the stored score column would produce.
 *
 * Deliberately not using `match.hasExtraTime`: that flag means the *format*
 * allows extra time (it is set from `requiresWinner`), not that the match
 * actually needed it — a group-stage cup tie can carry it and still finish
 * 90'+0`.
 */

import type { MatchEvent } from '@/lib/api';

export type CompletionMarker = 'extraTime' | 'shootout';

export interface CompletionScore {
  home: number;
  away: number;
}

export interface CompletionInfo {
  /** `'shootout'` for a tie decided on penalties, `'extraTime'` for one that
   *  merely played the extra 30 minutes, `null` for a regulation match. */
  marker: CompletionMarker | null;
  /** Score at the final whistle (120' when extra time was played). `null` when
   *  no `full_time` event carried a score. */
  finalScore: CompletionScore | null;
  /** Spot-kick tally — only set when `marker === 'shootout'`. */
  penaltyScore: CompletionScore | null;
}

/** `typeName` is the legacy field, `type` the current one — accept both. */
function isFullTime(event: MatchEvent): boolean {
  return event.type === 'full_time' || event.typeName === 'full_time';
}

function readScore(event: MatchEvent): CompletionScore | null {
  const home = event.data?.homeScore;
  const away = event.data?.awayScore;
  return typeof home === 'number' && typeof away === 'number'
    ? { home, away }
    : null;
}

/**
 * Walks the (chronological) event stream once and reports how the match ended
 * plus the scorelines needed to display it honestly.
 *
 * A shootout implies extra time, so the shootout check wins. Both flags are
 * accumulated across the whole stream rather than trusting the last event:
 * the shootout's closing `full_time` is not necessarily the final row once
 * post-match bookkeeping events (settlement lines, summaries) are appended.
 */
export function getCompletionInfo(events: MatchEvent[]): CompletionInfo {
  let sawExtraTime = false;
  let sawShootout = false;
  let finalScore: CompletionScore | null = null;
  let penaltyScore: CompletionScore | null = null;

  for (const event of events) {
    const period =
      typeof event.data?.period === 'string' ? event.data.period : '';
    if (period.startsWith('extra_time')) sawExtraTime = true;

    if (!isFullTime(event)) continue;
    if (event.data?.isPenalty === true) {
      sawShootout = true;
      penaltyScore = readScore(event) ?? penaltyScore;
    } else {
      finalScore = readScore(event) ?? finalScore;
    }
  }

  return {
    marker: sawShootout ? 'shootout' : sawExtraTime ? 'extraTime' : null,
    finalScore,
    // A stray `isPenalty` row in an unfinished stream must not surface a
    // shootout tally without the shootout marker.
    penaltyScore: sawShootout ? penaltyScore : null,
  };
}

/** Marker-only shorthand for callers that don't render the scorelines. */
export function getCompletionMarker(
  events: MatchEvent[],
): CompletionMarker | null {
  return getCompletionInfo(events).marker;
}
