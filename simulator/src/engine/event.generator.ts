// The exported helpers in this module are the *whole* live API: three
// neutral-announcement builders consumed by `match.engine.ts`. They build
// their `type` as a canonical lower-snake string on purpose — see the
// `weather_announcement` note below.
//
// NOTE: `descriptionIndex` previously attached a random per-event index here
// for picking among `commentary.*.tpl_N` templates. The field never crossed
// any boundary (no entity column, gateway drops it, WS drops it, formatter
// uses its own djb2 hash for stable variation). Generating it here just
// produced noise that contradicted the front-end's chosen variation.
//
// NOTE: this module used to also export a `class EventGenerator` (plus the
// `match-state.ts` it was the only consumer of). It was a pre-engine stub
// that rolled `Math.random()` against hard-coded zone probabilities and had
// zero callers once `match.engine.ts` took over. Removed 2026-08; the free
// `generate*Event` helpers below are the live API and are imported by
// `match.engine.ts` and `simulation.processor.ts`.

/**
 * Generate weather announcement event
 */
export function generateWeatherAnnouncementEvent(
  minute: number,
  weather: string,
  homeTeam: string,
  awayTeam: string,
  clockSeconds: number = minute * 60,
): any {
  // Format weather for display
  const weatherDisplay = weather
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // IMPORTANT: `type` must be the canonical lower-snake string (matching
  // the keys in simulation.processor.mapEventType), NOT the numeric
  // MatchEventType enum. The processor's bulk-insert path stores
  // `e.type` verbatim as `typeName`; if we pass the enum integer, the
  // row ends up with typeName='32'/'33' and a wrong `type` code
  // (the lookup map doesn't have those keys, so the fallback marks
  // the event as a tactical_change), which the FE then renders as
  // "32 at 0'" / "33 at 0'".
  return {
    type: 'weather_announcement',
    minute,
    second: 0,
    clockSeconds,
    teamId: undefined, // Neutral event
    data: {
      weather: weatherDisplay,
      weatherKey: weather,
      homeTeam,
      awayTeam,
    },
  };
}

/**
 * Generate attendance announcement event
 *
 * Surfaced as a separate neutral event (rather than a piggyback on
 * `weather_announcement`) so the FE can:
 *   - render crowd size independently of the weather line
 *   - still show weather when the upstream scheduler forgot to set
 *     `match.attendance` (e.g. older rows) without losing the
 *     weather context
 *   - extend the crowd panel later (breakdown by home/away, capacity
 *     fill rate) without bloating the weather event's data shape
 *
 * `attendance` is the final pre-computed number from
 * `fanService.calculateAttendance` and already accounts for capacity
 * cap + the ±5% fluctuation. The engine treats it as read-only.
 */
export function generateAttendanceAnnouncementEvent(
  minute: number,
  attendance: number,
  homeTeam: string,
  awayTeam: string,
  clockSeconds: number = minute * 60,
): any {
  return {
    type: 'attendance_announcement',
    minute,
    second: 0,
    clockSeconds,
    teamId: undefined, // Neutral event
    data: {
      attendance,
      homeTeam,
      awayTeam,
    },
  };
}

/**
 * Generate player introduction event (both teams lineup)
 */
export function generatePlayerIntroductionEvent(
  minute: number,
  homeTeam: string,
  awayTeam: string,
  homePlayers: Array<{ name: string; position: string }>,
  awayPlayers: Array<{ name: string; position: string }>,
  clockSeconds: number = minute * 60,
): any {
  return {
    type: 'player_introduction',
    minute,
    second: 0,
    clockSeconds,
    teamId: undefined, // Neutral event
    data: {
      homeTeam,
      awayTeam,
      homePlayers,
      awayPlayers,
    },
  };
}
