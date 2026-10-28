/**
 * lineup-order.ts — orders a starting XI the way a team sheet is read:
 * keeper, back line, midfield, forward line — and derives the formation
 * from those lines ("4-3-3").
 *
 * The engine emits the introduction with the players in whatever order the
 * tactics map was built (alphabetical by slot code: CB, CF, CM, GK, LB, …),
 * which reads like a shuffled list rather than a team sheet.
 */

export type LineupLine = 'gk' | 'def' | 'mid' | 'fwd' | 'other';

/** Slot code → line. Codes come from the tactics slot table (see CLAUDE.md). */
const LINE_OF: Record<string, LineupLine> = {
  GK: 'gk',

  LWB: 'def',
  LB: 'def',
  CBL: 'def',
  CB: 'def',
  CD: 'def',
  CBR: 'def',
  CDL: 'def',
  CDR: 'def',
  RB: 'def',
  RWB: 'def',

  LM: 'mid',
  CML: 'mid',
  CM: 'mid',
  CMR: 'mid',
  AM: 'mid',
  AML: 'mid',
  AMR: 'mid',
  RM: 'mid',
  DM: 'mid',
  DML: 'mid',
  DMR: 'mid',
  CAM: 'mid',
  CAML: 'mid',
  CAMR: 'mid',
  DMF: 'mid',
  DMFL: 'mid',
  DMFD: 'mid',
  DMFDL: 'mid',
  DMFDR: 'mid',
  DMFM: 'mid',
  DMFR: 'mid',

  LW: 'fwd',
  CFL: 'fwd',
  CF: 'fwd',
  CFR: 'fwd',
  RW: 'fwd',
  ST: 'fwd',
};

/** Left-to-right rank inside a line, so the sheet reads across the pitch. */
const SIDE_RANK: Record<string, number> = {
  LWB: 0,
  LB: 1,
  CBL: 2,
  CDL: 2,
  CB: 3,
  CD: 3,
  CBR: 4,
  CDR: 4,
  RB: 5,
  RWB: 6,

  LM: 0,
  DML: 0,
  AML: 0,
  CAML: 0,
  DMFL: 0,
  DMFDL: 0,
  CML: 1,
  CM: 2,
  DMFM: 2,
  DM: 2,
  AM: 2,
  CAM: 2,
  DMF: 2,
  DMFD: 2,
  CMR: 3,
  RM: 4,
  DMR: 4,
  AMR: 4,
  CAMR: 4,
  DMFR: 4,
  DMFDR: 4,

  LW: 0,
  CFL: 1,
  CF: 2,
  CFR: 3,
  RW: 4,
  ST: 2,
};

const LINE_WEIGHT: Record<LineupLine, number> = {
  gk: 0,
  def: 1,
  mid: 2,
  fwd: 3,
  other: 4,
};

export function lineOf(position: string | null | undefined): LineupLine {
  const code = (position ?? '').toUpperCase().trim();
  return LINE_OF[code] ?? 'other';
}

/**
 * Team-sheet order: keeper first, then defence → midfield → attack, each
 * line read left to right. Unknown codes sink to the bottom rather than
 * jumping to the top, and equal ranks keep their original order.
 */
export function sortLineup<T extends { position?: string | null }>(players: readonly T[]): T[] {
  return players
    .map((player, index) => ({ player, index }))
    .sort((a, b) => {
      const lineA = LINE_WEIGHT[lineOf(a.player.position)];
      const lineB = LINE_WEIGHT[lineOf(b.player.position)];
      if (lineA !== lineB) return lineA - lineB;
      const sideA = SIDE_RANK[(a.player.position ?? '').toUpperCase()] ?? 9;
      const sideB = SIDE_RANK[(b.player.position ?? '').toUpperCase()] ?? 9;
      if (sideA !== sideB) return sideA - sideB;
      return a.index - b.index;
    })
    .map(({ player }) => player);
}

/**
 * "4-3-3" from the same counting rule the tactics editor uses
 * (`web/src/components/tactics/api-helpers.ts` `computeFormation`):
 * keeper excluded, wingers count as attackers, wide midfielders as
 * midfielders. Returns null when there is no recognisable shape to state.
 */
export function formationOf(players: readonly { position?: string | null }[]): string | null {
  let def = 0;
  let mid = 0;
  let fwd = 0;
  for (const player of players) {
    switch (lineOf(player.position)) {
      case 'def':
        def += 1;
        break;
      case 'mid':
        mid += 1;
        break;
      case 'fwd':
        fwd += 1;
        break;
      default:
        break;
    }
  }
  if (def + mid + fwd === 0) return null;
  return `${def}-${mid}-${fwd}`;
}
