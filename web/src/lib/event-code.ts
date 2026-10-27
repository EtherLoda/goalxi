/** Event codes shown on hover: stable, readable, one per (class, outcome). */

export const EVENT_CLASS_CODE: Readonly<Record<number, string>> = {
  1: 'KICKOFF',
  2: 'PERIOD',
  3: 'SHOT',
  4: 'FOUL',
  5: 'FREEKICK',
  6: 'CORNER',
  7: 'PENALTY',
  8: 'TACTICAL',
  9: 'INJURY',
  13: 'INTRO',
  14: 'WEATHER',
  15: 'ATTENDANCE',
  16: 'FORFEIT',
  17: 'SNAPSHOT',
};

export interface EventCode {
  /** 'SHOT.GOAL' | 'KICKOFF' | 'UNKNOWN' */
  code: string;
  /** class portion, e.g. 'SHOT' */
  className: string;
  /** outcome portion, e.g. 'GOAL' (empty when the class has no outcome) */
  outcomeName: string;
}

const UNKNOWN: EventCode = { code: 'UNKNOWN', className: 'UNKNOWN', outcomeName: '' };
/**
 * Engine `typeName` -> code. `web/` does not depend on `@goalxi/database`
 * (same reason `fan-constants.ts` mirrors the fan rules), so the map is
 * duplicated here on purpose.
 */
export const EVENT_TYPE_CODE: Readonly<Record<string, string>> = {
  kickoff: 'KICKOFF',
  half_time: 'PERIOD.END',
  second_half: 'PERIOD.START',
  full_time: 'PERIOD.END',
  forfeit: 'FORFEIT',
  goal: 'SHOT.GOAL',
  shot_on_target: 'SHOT',
  shot_off_target: 'SHOT.MISS',
  miss: 'SHOT.MISS',
  save: 'SHOT.SAVE',
  turnover: 'SHOT.MISS',
  foul: 'FOUL.WARNING',
  yellow_card: 'FOUL.YELLOW',
  red_card: 'FOUL.RED',
  corner: 'CORNER.TAKEN',
  free_kick: 'FREEKICK.TAKEN',
  penalty_goal: 'PENALTY.GOAL',
  penalty_miss: 'PENALTY.MISS',
  substitution: 'TACTICAL.TACTICAL',
  tactical_change: 'TACTICAL.TACTICAL',
  injury: 'INJURY',
  snapshot: 'SNAPSHOT',
  weather_announcement: 'WEATHER',
  player_introduction: 'INTRO',
  attendance_announcement: 'ATTENDANCE',
};

/** Code for an event row, from its `typeName`. */
export function eventCodeFromTypeName(typeName: string | null | undefined): string {
  if (!typeName) return UNKNOWN.code;
  return EVENT_TYPE_CODE[typeName.toLowerCase()] ?? UNKNOWN.code;
}

/**
 * Build the hover code from the RFC 0002 two-axis tuple.
 * Storage keeps `typeName`; display must not leak the legacy int enum.
 */
export function eventCodeOf(
  axis:
    | { classId?: number | null; outcomeCode?: string | null }
    | null
    | undefined,
): EventCode {
  if (!axis || axis.classId == null) return UNKNOWN;
  const className = EVENT_CLASS_CODE[axis.classId];
  if (!className) return UNKNOWN;
  const outcomeName = axis.outcomeCode ?? '';
  return {
    code: outcomeName ? `${className}.${outcomeName}` : className,
    className,
    outcomeName,
  };
}
