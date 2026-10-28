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
 *   - one continuous list, no per-row chrome and no rules between rows
 *     (`divide-y` turned the rail into a spreadsheet; whitespace groups
 *     the moments well enough, and the glyphs already break the column up);
 *   - the minute is a quiet left axis (`tabular-nums`), not a badge;
 *   - a 2px team stripe carries attribution (green = home, warm = away);
 *   - the glyph is the same 14px glyph the commentary feed draws, so a goal
 *     looks like a goal wherever you read it;
 *   - the right edge carries **only** the running score, on the goal rows.
 *     Card and injury rows used to print `YC` / `RC` / `2Y` / `INJ` there,
 *     which added a second, shoutier column of information for something the
 *     glyph beside the name already says. The empty right edge on those rows
 *     is what makes the score column legible as a score column.
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
}

const HOME_STRIPE = '#00e479';
const AWAY_STRIPE = '#ffdb9d';

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
}: MatchKeyEventsProps) {
  // Chronological, earliest first — the same order as the commentary feed.
  // The list is intentionally not sliced; the panel scrolls instead.
  const entries = extractKeyEvents(events, rosterById, homeTeamId, awayTeamId).sort(
    (a, b) => a.minute - b.minute || a.label.localeCompare(b.label),
  );

  if (entries.length === 0) return null;

  const scores = runningScores(entries);

  return (
    <ul className="flex flex-col">
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

  return (
    <li className="flex items-center gap-2 py-1">
      <span
        className={`w-8 shrink-0 text-right font-label text-label tabular-nums ${
          isCurrent ? 'text-primary' : 'text-muted'
        }`}
      >
        {minute}&apos;
      </span>

      {/* Team attribution. `aria-hidden` because a stripe is a redundant
          cue — the row's own side is already carried by the fixture above. */}
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
        <span className="block truncate text-body leading-tight text-on-surface">
          {entry.label}
        </span>
        {entry.note && (
          <span className="block truncate text-label leading-tight text-muted">{entry.note}</span>
        )}
      </span>

      {score && (
        <span className="shrink-0 text-right font-mono text-label font-semibold tabular-nums text-primary">
          {score}
        </span>
      )}
    </li>
  );
}
