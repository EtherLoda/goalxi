"use client";

import { useTranslations } from "next-intl";
import type { CupMatch } from "@/lib/cup-api";

interface RoundTreeProps {
  /**
   * The "tree" rounds to render side-by-side. The FE passes the
   * four rounds starting at the Round of 16 (R8 in L1-L4 MVP).
   * The order is left-to-right: earliest to latest. If the user
   * is viewing an earlier round (R8 only) the others can be
   * omitted and the layout will collapse gracefully.
   */
  rounds: Array<{
    roundNumber: number;
    roundName: string;
    matches: CupMatch[];
  }>;
}

/**
 * A horizontal bracket tree for the late rounds (R8..R11 = Round
 * of 16 → QF → SF → Final). 16 teams collapse to 1 champion
 * across 4 rounds.
 *
 * Why a CSS grid (and not SVG):
 *  - It auto-fits to the viewport width.
 *  - The line connectors are simple `border-l` + `border-b` on
 *    spacer cells, so the whole tree is HTML.
 *  - It scales linearly with the number of rounds; the L1-L6
 *    extension (5 rounds from R12) is the same code path.
 *
 * The grid has `2^N` rows, one per "entry" team. Each round's
 * match occupies `2^(N - roundIdx)` rows centred on the pair of
 * teams that play. The result: a match in round 0 spans 16 rows
 * (no offset), round 1 spans 8 rows, etc. — the classic bracket.
 */
export default function RoundTree({ rounds }: RoundTreeProps) {
  if (rounds.length === 0) return null;

  // Deepest round determines the row count. The first (leftmost)
  // round has the most matches; each subsequent round halves.
  const totalRows = rounds[0].matches.length * 2;

  // Build a column-per-round layout. Each column has `totalRows`
  // cells; a match cell is `matchSpan` rows tall and vertically
  // centred between the two team rows. Between rounds we add a
  // single connector column (just a centred line).
  return (
    <div className="glass-panel p-4 rounded-2xl border border-outline-variant/10 overflow-x-auto">
      <div
        className="grid items-center gap-x-2 min-w-[720px]"
        style={{
          gridTemplateRows: `repeat(${totalRows}, minmax(0, 1fr))`,
          gridTemplateColumns: `repeat(${rounds.length * 2 - 1}, minmax(180px, 1fr))`,
        }}
      >
        {rounds.map((round, roundIdx) => {
          const matchSpan = Math.pow(2, roundIdx + 1);
          return (
            <RoundColumn
              key={round.roundNumber}
              round={round}
              roundIdx={roundIdx}
              matchSpan={matchSpan}
              totalRounds={rounds.length}
              isLast={roundIdx === rounds.length - 1}
            />
          );
        })}
      </div>
    </div>
  );
}

interface RoundColumnProps {
  round: { roundNumber: number; roundName: string; matches: CupMatch[] };
  roundIdx: number;
  matchSpan: number;
  totalRounds: number;
  isLast: boolean;
}

function RoundColumn({
  round,
  roundIdx,
  matchSpan,
  isLast,
}: RoundColumnProps) {
  const t = useTranslations("cup");
  return (
    <>
      <div
        className="col-start-1 row-span-full flex items-start pt-2"
        style={{ gridColumnStart: roundIdx * 2 + 1 }}
      >
        <div className="font-label text-[10px] font-black uppercase tracking-[0.15em] text-on-surface-variant/60">
          {t("round.tab", { number: round.roundNumber + 1 })} · {round.roundName}
        </div>
      </div>
      {round.matches.map((m, i) => {
        // The match's top row is `i * matchSpan`. We then leave a
        // 1-cell gap below the match and another matchSpan cells
        // until the next match. Spans always start on a multiple
        // of matchSpan — that aligns the next match's half.
        const startRow = i * matchSpan + 1;
        const isBye = m.isBye || (!m.homeTeam && !m.awayTeam);
        return (
          <div
            key={m.matchId ?? `bye-r${round.roundNumber}-${i}`}
            style={{
              gridColumnStart: roundIdx * 2 + 1,
              gridRowStart: startRow,
              gridRowEnd: startRow + matchSpan,
            }}
            className="px-1 py-1"
          >
            <TreeMatchCard match={m} isBye={isBye} />
          </div>
        );
      })}
      {/* Connector column: a vertical line centred between this
          round and the next. Visible only when there's a next
          round. */}
      {!isLast && (
        <div
          className="row-span-full"
          style={{
            gridColumnStart: roundIdx * 2 + 2,
          }}
        >
          <ConnectorColumn matchSpan={matchSpan} />
        </div>
      )}
    </>
  );
}

function ConnectorColumn({ matchSpan }: { matchSpan: number }) {
  // A single vertical line of cells, with a horizontal "elbow"
  // pointing left every `matchSpan` rows. We render alternating
  // border segments to keep the markup cheap.
  // For our 4-round (16-team) layout this is 32 rows; the
  // pattern repeats every `matchSpan` rows.
  const totalRows = matchSpan * 4; // safe upper bound for a 16-team tree
  return (
    <div
      className="grid h-full"
      style={{
        gridTemplateRows: `repeat(${totalRows}, minmax(0, 1fr))`,
      }}
    >
      {Array.from({ length: totalRows }).map((_, idx) => {
        // Draw a horizontal "elbow" at every other matchSpan/2
        // boundary (entering and leaving each match). The pattern
        // is: at multiples of matchSpan/2 from a match start, draw
        // a horizontal segment toward the previous column.
        const isHorizontal =
          idx % matchSpan === Math.floor(matchSpan / 2);
        return (
          <div
            key={idx}
            className={
              isHorizontal
                ? "border-t border-l border-outline-variant/40 self-center"
                : "self-center"
            }
            style={{ height: 1 }}
          />
        );
      })}
    </div>
  );
}

function TreeMatchCard({
  match,
  isBye,
}: {
  match: CupMatch;
  isBye: boolean;
}) {
  const t = useTranslations("cup.match");
  const winnerId = match.winnerTeamId;
  const hasResult = Boolean(winnerId);

  if (isBye) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="glass-panel px-3 py-2 rounded-lg border border-outline-variant/10 text-center w-full">
          <div className="font-headline text-xs font-bold text-on-surface/80 truncate">
            {match.homeTeam?.name ?? t("tbd")}
          </div>
          <div className="font-label text-[9px] font-black uppercase tracking-[0.15em] text-primary/80 mt-0.5">
            {t("bye")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col justify-center">
      <div className="glass-panel rounded-lg border border-outline-variant/10 overflow-hidden">
        <TeamLine
          name={match.homeTeam?.name ?? t("tbd")}
          isWinner={hasResult && winnerId === match.homeTeam?.id}
          isLoser={hasResult && winnerId !== null && winnerId !== match.homeTeam?.id}
        />
        <div className="h-px bg-outline-variant/20" />
        <TeamLine
          name={match.awayTeam?.name ?? t("tbd")}
          isWinner={hasResult && winnerId === match.awayTeam?.id}
          isLoser={hasResult && winnerId !== null && winnerId !== match.awayTeam?.id}
        />
      </div>
    </div>
  );
}

function TeamLine({
  name,
  isWinner,
  isLoser,
}: {
  name: string;
  isWinner: boolean;
  isLoser: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5">
      <span
        className={
          "font-headline text-xs font-bold truncate " +
          (isWinner
            ? "text-primary"
            : isLoser
              ? "text-on-surface/40 line-through"
              : "text-on-surface")
        }
      >
        {name}
      </span>
      {isWinner && (
        <span className="material-symbols-outlined text-sm text-primary shrink-0">
          check_circle
        </span>
      )}
    </div>
  );
}
