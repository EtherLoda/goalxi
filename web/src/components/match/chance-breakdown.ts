/**
 * chance-breakdown.ts — where a team's chances came from.
 *
 * The report sidebar's "机会分布" card answers one question Hattrick
 * popularised: of all the chances a side created, how many came down
 * each flank, through the middle, or from a set piece? The two numbers
 * at the top of the card are therefore the *sum* of the rows below —
 * every counted chance lands in exactly one bucket.
 *
 * Classification rules, in order:
 *
 *   1. A penalty shootout kick is not a chance (it has no lane and is
 *      not part of the 90/120 minutes). `penalty_goal` / `penalty_miss`
 *      at 120' are skipped outright.
 *   2. Anything carrying `data.setPieceType` (corner, direct free kick,
 *      indirect free kick, penalty) is a set piece — including the
 *      goals those set pieces produced.
 *   3. An open-play shot (`data.shot` present: goal / save / miss) is
 *      filed under `data.lane`.
 *   4. A blocked push (`data.ffinalResult === 'blocked'`, no shot) still
 *      counts — the attack reached the box before a defender got a boot
 *      in, and it is usually what forced the corner.
 *   5. Everything else (turnovers, cards, fouls, open-play saves at
 *      midfield) is not a chance and is dropped.
 *
 * "Is this an attempt?" lives in `shot-attempts.ts` and is shared with the
 * match-stats card, so 射门 always equals the sum of the rows here.
 *
 * Kept free of React so Jest can unit-test it directly.
 */

import type { MatchEvent } from "@/lib/api";
import { canonicalEventType } from "@/lib/commentary";
import { resolveSide } from "./match-event-side";
import { shotOutcome } from "./shot-attempts";

export type ChanceLane = "left" | "center" | "right" | "setPiece";

export interface ChanceRow {
  lane: ChanceLane;
  home: number;
  away: number;
}

export interface ChanceBreakdown {
  /** Chances created by the home side — always `sum(rows.home)`. */
  home: number;
  /** Chances created by the away side — always `sum(rows.away)`. */
  away: number;
  rows: ChanceRow[];
}

/** Top-to-bottom order on the card: flank, middle, flank, set pieces. */
export const CHANCE_LANES: readonly ChanceLane[] = [
  "left",
  "center",
  "right",
  "setPiece",
];

/** Shootout kicks: 120', no lane, not part of the open play totals. */
const SHOOTOUT_TYPES = new Set(["PENALTY_GOAL", "PENALTY_MISS"]);

const LANES = new Set<ChanceLane>(["left", "center", "right"]);

function laneOf(event: MatchEvent): ChanceLane | null {
  const data = event.data;
  if (!data) return null;

  // Set pieces are checked first on purpose: a *missed open-play penalty*
  // is emitted as `type: 'penalty_miss'` (the shootout reuses that type),
  // so the type alone cannot tell the two apart. Every real set piece
  // carries `data.setPieceType`; shootout kicks carry only the running
  // shootout score.
  if (typeof data.setPieceType === "string" && data.setPieceType.length > 0) {
    return "setPiece";
  }

  const type = canonicalEventType(event.typeName ?? event.type);
  if (SHOOTOUT_TYPES.has(type)) return null;

  if (!shotOutcome(event)) return null;

  const lane = data.lane;
  if (typeof lane !== "string" || !LANES.has(lane as ChanceLane)) return null;

  return lane as ChanceLane;
}

/**
 * Tally chances per lane for both sides.
 *
 * `homeTeamId` / `awayTeamId` are only needed for payloads that carry a
 * `teamId` but no `isHome` flag; `resolveSide` already prefers the flag.
 */
export function buildChanceBreakdown(
  events: readonly MatchEvent[],
  homeTeamId?: string | null,
  awayTeamId?: string | null,
): ChanceBreakdown {
  const rows: ChanceRow[] = CHANCE_LANES.map((lane) => ({
    lane,
    home: 0,
    away: 0,
  }));
  const byLane = new Map(rows.map((row) => [row.lane, row]));
  let home = 0;
  let away = 0;

  for (const event of events) {
    const lane = laneOf(event);
    if (!lane) continue;
    const side = resolveSide(event, homeTeamId, awayTeamId);
    if (side === "neutral") continue;
    const row = byLane.get(lane);
    if (!row) continue;
    if (side === "home") {
      row.home += 1;
      home += 1;
    } else {
      row.away += 1;
      away += 1;
    }
  }

  return { home, away, rows };
}
