/**
 * MatchKeyEvents — the match's defining moments as a dense, scannable list.
 *
 * Design notes
 * ------------
 * This panel sits in a 300px rail, under a kicker header supplied by the
 * caller, and competes with a live commentary feed for attention. The old
 * layout gave every moment its own bordered chip with a team-tinted minute
 * badge and a 24px glyph — ten boxes stacked on top of each other, which
 * read as ten buttons and buried the one thing the list is about: the score
 * moving.
 *
 * The rewrite follows the classic sports-paper "highlights" column:
 *
 *   - one continuous list separated by hairlines, no per-row chrome;
 *   - the minute is a quiet left axis (`tabular-nums`), not a badge;
 *   - a 2px team stripe carries attribution (green = home, warm = away),
 *     explained by the legend at the top so it needs no prior knowledge;
 *   - the glyph shrinks to 14px and stops competing with the name;
 *   - the right edge is a single tabular column: the running score on goals,
 *     the card/booking tag otherwise, so goals line up vertically and the
 *     match story reads down the edge.
 *
 * Attribution rules live in `extract-key-events.ts`; this file only decides
 * how they are drawn.
 */
'use client';

import React from 'react';
import type { MatchEvent } from '@/lib/api';
import { extractKeyEvents, type EventEntry } from './extract-key-events';
import { formatMatchMinute, type InjuryWindow } from './match-timeline';
import { Tooltip } from '@/components/ui/Tooltip';
import { eventCodeOf } from '@/lib/event-code';

interface MatchKeyEventsProps {
  events: MatchEvent[];
  /** Roster map for name resolution */
  rosterById: Map<string, { name: string }>;
  /** Minute to highlight as "current" */
  currentMinute?: number;
  /**
   * Home / away team ids. The simulator payload only ships `teamId`
   * on each event (no `isHome` flag), so we derive the side from
   * `event.teamId` comparison. Without these, every team-attributed
   * event is misread as away.
   */
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  /** Stoppage windows derived from the same `events` list. Used to
   *  format the minute column with the "+N" suffix (e.g. "45+1'" */
  injuryWindows?: InjuryWindow[];
  /**
   * Team names for the colour legend. Optional so the component still
   * works when a caller only knows ids; without them the stripes keep
   * their meaning for anyone who saw the scoreline above, but the
   * legend is skipped rather than guessing.
   */
  homeTeamName?: string | null;
  awayTeamName?: string | null;
}

const HOME_STRIPE = '#00e479';
const AWAY_STRIPE = '#ffdb9d';

/** Tag colour by kind. Deliberately semantic, not decorative: a booking is
 *  amber/red because that is the card, and `INJ` is rose because it stops
 *  the player — nobody has to learn a palette. */
function tagClass(tag: string): string {
  if (tag === 'YC') return 'text-amber-300';
  if (tag === 'RC' || tag === '2Y') return 'text-red-400';
  return 'text-rose-300';
}

/**
 * Running score per row, recomputed from the goal rows in order. The
 * simulator stores the final score on the match, not per event, and own
 * goals are already credited to the right side by `resolveSide`, so a
 * plain fold is enough. Kept as a module-level pure function (rather than
 * a `let` inside the component) so the render body stays free of
 * post-render mutation.
 */
function runningScores(entries: EventEntry[]): (string | null)[] {
  const scores: (string | null)[] = [];
  let home = 0;
  let away = 0;
  for (const entry of entries) {
    if (entry.kind !== 'goal') {
      scores.push(null);
      continue;
    }
    if (entry.side === 'home') home += 1;
    else away += 1;
    scores.push(`${home}–${away}`);
  }
  return scores;
}

export function MatchKeyEvents({
  events,
  rosterById,
  currentMinute,
  homeTeamId,
  awayTeamId,
  injuryWindows,
  homeTeamName,
  awayTeamName,
}: MatchKeyEventsProps) {
  // Chronological, earliest first — the same order as the commentary feed.
  // The list is intentionally not sliced; the panel scrolls instead.
  const entries = extractKeyEvents(events, rosterById, homeTeamId, awayTeamId).sort(
    (a, b) => a.minute - b.minute || a.label.localeCompare(b.label),
  );

  if (entries.length === 0) return null;

  const scores = runningScores(entries);

  const legend = Boolean(homeTeamName && awayTeamName);

  return (
    <div className="flex flex-col">
      {/* Legend — the stripes are only meaningful if the reader can resolve
          the two colours. Two dots and two names is the whole price. */}
      {legend && (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-label text-label text-muted">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: HOME_STRIPE }}
            />
            <span className="truncate">{homeTeamName}</span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: AWAY_STRIPE }}
            />
            <span className="truncate">{awayTeamName}</span>
          </span>
        </div>
      )}

      <ul className="divide-y divide-white/[0.06]">
        {entries.map((entry, i) => (
          <KeyEventRow
            key={`${entry.minute}-${entry.label}-${i}`}
            entry={entry}
            score={scores[i] ?? null}
            currentMinute={currentMinute}
            injuryWindows={injuryWindows}
          />
        ))}
      </ul>
    </div>
  );
}

function KeyEventRow({
  entry,
  score,
  currentMinute,
  injuryWindows,
}: {
  entry: EventEntry;
  score: string | null;
  currentMinute?: number;
  injuryWindows?: InjuryWindow[];
}) {
  const minute = formatMatchMinute(entry.minute, injuryWindows ?? []);
  const isCurrent = currentMinute != null && entry.minute === currentMinute;
  const stripe = entry.side === 'home' ? HOME_STRIPE : AWAY_STRIPE;
  // A goal's right-hand slot is the running score; everything else falls
  // back to its booking/injury tag. The two never compete for the column,
  // so a goal that is also "OG"/"PEN" keeps its score on the edge and
  // shows the qualifier as a small inline chip instead.
  const right = score ?? entry.tag ?? null;
  const inlineTag = score ? (entry.tag ?? null) : null;

  return (
    <li className="flex items-center gap-2 py-[5px]">
      <span
        className={`w-8 shrink-0 text-right text-label tabular-nums ${
          isCurrent ? 'text-primary' : 'text-muted'
        }`}
      >
        {minute}&apos;
      </span>

      {/* Team attribution. `aria-hidden` because the legend already spells
          the colours out — the stripe is a redundant cue, not content. */}
      <span
        aria-hidden
        className="w-[2px] shrink-0 self-stretch rounded-full"
        style={{ backgroundColor: stripe }}
      />

      <Tooltip
        side="top"
        align="end"
        label={
          <span className="flex flex-col gap-0.5">
            <span>{entry.label}</span>
            <span className="font-mono text-[10px] tracking-wider text-on-surface/50">
              {eventCodeOf(entry).code}
            </span>
          </span>
        }
      >
        <span className="inline-flex shrink-0">
          <entry.icon size={14} />
        </span>
      </Tooltip>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="truncate text-body leading-tight text-on-surface">{entry.label}</span>
          {inlineTag && (
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-wide text-muted">
              {inlineTag}
            </span>
          )}
        </span>
        {entry.note && (
          <span className="block truncate text-label leading-tight text-muted">{entry.note}</span>
        )}
      </span>

      {right && (
        <span
          className={`shrink-0 text-right font-mono text-label font-semibold tabular-nums ${
            score ? 'text-primary' : tagClass(entry.tag ?? '')
          }`}
        >
          {right}
        </span>
      )}
    </li>
  );
}
