/**
 * Deriving a league's matchweek / matchday view from its fixture list.
 *
 * ## Why this is not inline in the page component
 *
 * The league page used to compute a "global matchday index" as
 * `m.round ?? m.week * 2`, then sort, group and label everything by it.
 * That had three defects, none of which needed a season-length change to
 * become visible:
 *
 *   1. `* 2` encoded "two fixtures per match-week" as a literal in the
 *      client. The season moved to three fixtures a week and the key
 *      silently stopped ordering anything correctly.
 *   2. It was applied to every row the endpoint returned, including cup
 *      fixtures. Cup rows carry `week: 0` and their own round number
 *      (0..11, written by `CupScheduler`), so cup "rounds" were folded
 *      straight into the league ladder.
 *   3. `totalMatchweeks` was a hardcoded `16` and the season number a
 *      hardcoded `2024`, so the header read "Round 30 / 16" with a
 *      permanently full progress bar.
 *
 * Everything here is derived from the rows themselves, so none of it needs
 * to know how many fixtures a match-week holds.
 */

/**
 * The subset of a match row this module needs.
 *
 * A CONSTRAINT, not a parameter type: every helper below is generic over
 * `T extends FixtureLike` so the caller's own richer row type (`Match`)
 * survives the chain instead of being widened to this shape.
 *
 * `leagueId` is nullable because cup rows carry `null` — that is precisely
 * how they get identified.
 */
export interface FixtureLike {
  leagueId: string | null;
  season: number;
  week: number;
  /** 1..ROUNDS_PER_WEEK on a league row; a cup round number on a cup row. */
  round?: number;
  type?: string;
  scheduledAt: string;
  status: string;
}

/**
 * A league's own fixtures, excluding cup ties.
 *
 * `type` is the discriminator (`LEAGUE` on league rows, `CUP` on cup rows).
 * Both checks are needed: cup rows have `leagueId: null`, but a league row
 * is identified by its type, and relying on `leagueId` alone would let a
 * future cup variant that does carry a league id leak in.
 */
export function leagueFixtures<T extends FixtureLike>(
  matches: readonly T[],
  leagueId: string,
): T[] {
  return matches.filter(
    (m) => m.type === 'LEAGUE' && m.leagueId === leagueId,
  );
}

/**
 * Identity of a matchday within a season: the `(week, round)` tuple.
 *
 * A tuple rather than a flattened integer, precisely so it needs no
 * rounds-per-week constant. Sort by `scheduledAt` rather than by this —
 * the timestamp is authoritative and already ordered.
 */
export function matchdayKey(m: FixtureLike): string {
  return `${m.week}:${m.round ?? 1}`;
}

const byKickoff = (a: FixtureLike, b: FixtureLike): number =>
  a.scheduledAt.localeCompare(b.scheduledAt);

/**
 * How many matchweeks this league's fixture list spans.
 *
 * `max(week)` over the rows the API returned, so it is correct for any
 * season shape and for a partially-generated schedule. Returns 0 for an
 * empty list rather than `-Infinity` or `0`-vs-`undefined` ambiguity at
 * the call site.
 */
export function totalMatchweeks(matches: readonly FixtureLike[]): number {
  return matches.reduce((max, m) => Math.max(max, m.week), 0);
}

/**
 * The season number these fixtures belong to, or `null` when there are
 * none. Replaces a hardcoded `2024`.
 */
export function fixtureSeason(
  matches: readonly FixtureLike[],
): number | null {
  return matches.length > 0 ? matches[0].season : null;
}

/**
 * The matchweek the league is currently in: the last one with any
 * completed match, else 1.
 *
 * This is a WEEK number, not a matchday index. The previous code passed a
 * global matchday index into the same field, which is why the progress bar
 * read 30-of-16.
 */
export function currentMatchweek(
  matches: readonly FixtureLike[],
  completedStatus: string,
): number {
  const weeks = matches
    .filter((m) => m.status === completedStatus)
    .map((m) => m.week);
  return weeks.length > 0 ? Math.max(...weeks) : 1;
}

export interface MatchdayGroups<T extends FixtureLike> {
  /** Most recent completed matchday first. */
  lastMatchday: T[];
  /** Next scheduled matchday. Empty when the season is over. */
  nextMatchday: T[];
}

/**
 * The two matchdays the league page shows: the last one played and the
 * next one due.
 *
 * `nextMatchday` is empty rather than falling back to "one past the last
 * completed" when the season is finished. The old fallback invented a
 * matchday that did not exist and rendered it as an upcoming fixture.
 */
export function matchdayGroups<T extends FixtureLike>(
  matches: readonly T[],
  statuses: { completed: string; upcoming: readonly string[] },
): MatchdayGroups<T> {
  const completed = matches
    .filter((m) => m.status === statuses.completed)
    .sort((a, b) => byKickoff(b, a));

  const scheduled = matches
    .filter((m) => statuses.upcoming.includes(m.status))
    .sort(byKickoff);

  const lastKey = completed.length > 0 ? matchdayKey(completed[0]) : null;
  const nextKey = scheduled.length > 0 ? matchdayKey(scheduled[0]) : null;

  return {
    lastMatchday: lastKey
      ? completed.filter((m) => matchdayKey(m) === lastKey)
      : [],
    nextMatchday: nextKey
      ? scheduled.filter((m) => matchdayKey(m) === nextKey)
      : [],
  };
}
