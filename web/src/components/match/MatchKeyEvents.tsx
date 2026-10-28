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
import { AppIcon } from '@/components/icons/AppIcon';
import { usePlayerCardOptional } from './player-card-context';
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
   * Show the chances that did not end in a goal (saves, misses,
   * turnovers) in addition to goals, bookings and substitutions. The
   * caller owns this flag because it renders the toggle.
   */
  detailed?: boolean;
  /**
   * Event picked from the strip or from this list. Row gets a wash + ring so
   * the reader can see which moment the commentary feed is pointing at.
   */
  selectedEventId?: string | null;
  /**
   * Called on row click with the source event id. The parent forwards it to
   * the commentary feed, which highlights (and scrolls to) the sentence for
   * the same moment. Rows without an id stay inert.
   */
  /** Fired with the row's minute so the pitch can jump to that moment. */
  onSelectEvent?: (eventId: string, minute: number) => void;
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

/**
 * Which rows survive in each mode.
 *
 * `compact` is the scoreline story: goals, bookings and substitutions.
 * `detailed` adds the chances that did not go in (saves, misses,
 * turnovers) — the same two-step Hattrick offers behind the expand icon
 * in its highlights header, and the reason a 0-0 can still have a
 * readable list.
 *
 * Injuries stay out of both: they arrive as their own event rows and
 * "player X is hurt" is already the loudest line in the commentary feed.
 * Exported so the mode contract is testable without a renderer.
 */
export function visibleKeyEvents(entries: EventEntry[], detailed: boolean): EventEntry[] {
  return entries.filter((entry) => {
    if (entry.kind === 'injury') return false;
    if (entry.kind === 'shot') return detailed;
    return true;
  });
}

/**
 * The compact/detailed switch. Lives in the caller's panel header (the
 * caller owns the `detailed` state), which is why the labels come in as
 * props rather than from a namespace this component would have to guess.
 */
export function KeyEventsToggle({
  detailed,
  onToggle,
  label,
}: {
  detailed: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={detailed}
      aria-label={label}
      title={label}
      className={`ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
        detailed
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-white/10 text-muted hover:border-white/20 hover:text-on-surface'
      }`}
    >
      {/* The glyph is the same either way — "expand this list" — so the
          pressed state is what tells you the list is already expanded. */}
      <AppIcon name="expand" className="text-sm" />
    </button>
  );
}

export function MatchKeyEvents({
  events,
  rosterById,
  currentMinute,
  homeTeamId,
  awayTeamId,
  injuryWindows,
  detailed = false,
  selectedEventId,
  onSelectEvent,
}: MatchKeyEventsProps) {
  // Chronological, earliest first — the same order as the commentary feed.
  // The list is intentionally not sliced; the panel scrolls instead.
  const entries = visibleKeyEvents(
    extractKeyEvents(events, rosterById, homeTeamId, awayTeamId),
    detailed,
  ).sort(
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
          isSelected={Boolean(entry.eventId) && entry.eventId === selectedEventId}
          onSelect={
            entry.eventId && onSelectEvent
              ? () => onSelectEvent(entry.eventId as string, entry.minute)
              : undefined
          }
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
  isSelected = false,
  onSelect,
}: {
  entry: EventEntry;
  score: string | null;
  currentMinute?: number;
  injuryWindows?: InjuryWindow[];
  isSelected?: boolean;
  onSelect?: () => void;
}) {
  const minute = formatMatchMinute(entry.minute, injuryWindows ?? []);
  const isCurrent = currentMinute != null && entry.minute === currentMinute;
  const stripe = entry.side === 'home' ? HOME_STRIPE : AWAY_STRIPE;
  const playerCard = usePlayerCardOptional();

  return (
    <li>
      <button
        type="button"
        disabled={!onSelect}
        onClick={onSelect}
        aria-pressed={isSelected}
        className={`flex w-full items-center gap-2 rounded-md py-1 pl-1 pr-0.5 text-left transition-colors disabled:cursor-default ${
          isSelected
            ? 'bg-primary/10 ring-1 ring-inset ring-primary/40'
            : onSelect
              ? 'hover:bg-white/[0.04]'
              : ''
        }`}
      >
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
        {/* A span rather than a nested button: the row itself is the button
            that selects the moment, and nesting interactive elements is
            invalid. The name is a mouse affordance to open the player card —
            same as the pitch markers and the commentary names. */}
        <span
          onClick={
            entry.playerId != null && playerCard
              ? (e) => {
                  e.stopPropagation();
                  playerCard.openPlayer(entry.playerId as number);
                }
              : undefined
          }
          className={`block truncate text-body leading-tight text-on-surface ${
            entry.playerId != null && playerCard
              ? 'cursor-pointer hover:text-primary hover:underline hover:decoration-primary/50 hover:underline-offset-2'
              : ''
          }`}
        >
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
      </button>
    </li>
  );
}
