/**
 * pitch-duels.ts — the geometry behind the "阵容评级" pitch map.
 *
 * The old panel was a 3×3 table: rows ATK / POS / DEF, columns LEFT /
 * CENTRE / RIGHT, each cell comparing the two teams' *same* phase in the
 * *same* lane. That reads as a spreadsheet, and it puts the home left
 * winger next to the away left winger — who never actually face each
 * other on the pitch.
 *
 * This module turns the same `ls` numbers into **duels**, laid out where
 * they happen on the grass:
 *
 *   ┌──────────────┬──────────────┬──────────────┐
 *   │ home def     │ home pos     │ home atk     │
 *   │  vs away atk │  vs away pos │  vs away def │
 *   ├──────────────┼──────────────┼──────────────┤
 *   │            … three lanes down the pitch    │
 *   └──────────────┴──────────────┴──────────────┘
 *
 * Lane mirroring: the home side defends the left goal (facing right), the
 * away side defends the right goal (facing left). Facing opposite ways
 * means their left wings are on *opposite* touchlines, so home's left
 * band meets the away side's *right* band. `mirrorLane` encodes that, and
 * it is why the map needs no "L / C / R" captions — the position on the
 * pitch says which band it is.
 */

import type { Lane, MatchSnapshot } from "./match-pitch-data";

export type DuelPhase = "atk" | "pos" | "def";

/** Columns of the map, home end → away end. */
export type DuelColumn = "homeThird" | "middle" | "awayThird";

export interface DuelZone {
  /** Where on the pitch this duel happens. */
  column: DuelColumn;
  /** Band across the pitch, in the home team's frame (top → bottom). */
  row: Lane;
  /** Same band in the away team's frame — always the mirror of `row`. */
  awayLane: Lane;
  /** Which rating of the home side is being tested here. */
  homePhase: DuelPhase;
  /** Which rating of the away side is doing the testing. */
  awayPhase: DuelPhase;
  /** Home rating (0–10 display magnitude). */
  home: number;
  /** Away rating (0–10 display magnitude). */
  away: number;
  /** Home's share of the duel, 0–1. 0.5 when both sides read zero. */
  homeShare: number;
}

/** Bands in screen order: home's left touchline is the top of the map. */
const ROWS: readonly Lane[] = ["left", "center", "right"];

const COLUMNS: ReadonlyArray<{
  column: DuelColumn;
  homePhase: DuelPhase;
  awayPhase: DuelPhase;
}> = [
  { column: "homeThird", homePhase: "def", awayPhase: "atk" },
  { column: "middle", homePhase: "pos", awayPhase: "pos" },
  { column: "awayThird", homePhase: "atk", awayPhase: "def" },
];

const MIRROR: Record<Lane, Lane> = {
  left: "right",
  center: "center",
  right: "left",
};

/** The band on the other touchline for the opposing team. */
export function mirrorLane(lane: Lane): Lane {
  return MIRROR[lane];
}

/**
 * Nine duels in row-major order, so a CSS `grid-cols-3` fills the map the
 * way it is drawn: top band left→right, then the middle band, then the
 * bottom one.
 */
export function buildDuels(snapshot: MatchSnapshot): DuelZone[] {
  const zones: DuelZone[] = [];
  for (const row of ROWS) {
    const awayLane = mirrorLane(row);
    for (const column of COLUMNS) {
      // The simulator emits lane strengths already on the 0–10 display
      // magnitude (see `formatLanes`); older snapshots may lack `ls`.
      const home = snapshot.h.ls?.[row]?.[column.homePhase] ?? 0;
      const away = snapshot.a.ls?.[awayLane]?.[column.awayPhase] ?? 0;
      const total = home + away;
      zones.push({
        column: column.column,
        row,
        awayLane,
        homePhase: column.homePhase,
        awayPhase: column.awayPhase,
        home,
        away,
        homeShare: total === 0 ? 0.5 : home / total,
      });
    }
  }
  return zones;
}
