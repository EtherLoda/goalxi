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
 * Build the hover code from the RFC 0002 two-axis tuple.
 * Storage keeps `typeName`; display must not leak the legacy int enum.
 */
export function eventCodeOf(
  axis: { classId: number | null; outcomeCode: string | null } | null | undefined,
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
