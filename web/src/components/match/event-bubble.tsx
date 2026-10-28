/**
 * event-bubble.tsx — single-row event entry for the commentary feed.
 *
 * Each row is a strict 2-column grid: [minute] | [icon + description].
 * The minute lives in its own column so the eye can scan minutes down
 * the page like a transcript — the user can find "what happened at
 * 33'?" without parsing each bubble.
 *
 * Side (home / away / neutral) is conveyed by colour alone:
 *   - home:   primary tint, with the team colour overlaid on the
 *             minute and left border when supplied.
 *   - away:   secondary tint, same override rules.
 *   - neutral: muted on-surface-variant, faint container-lowest wash
 *             (kickoff, weather, attendance — no team to attribute).
 *
 * Everything is left-aligned in a single chronological column; there
 * is no chat-style two-column split anymore. The row tint makes the
 * home/away/neutral split obvious at a glance, the icon and minute
 * reinforce the attribution, and the border picks up the team colour
 * for an extra cue.
 *
 * Spotlight events (goal, red card, sub, period transitions) are
 * deliberately skipped here — they live in the dedicated spotlight
 * card so the feed doesn't double up.
 */
'use client';

import React, { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { MatchEvent } from '@/lib/api';
import { canonicalEventType, formatEventCommentary } from '@/lib/commentary';
import { LinkedPlayerText } from './linked-player-text';
import { formationOf, lineOf, sortLineup } from './lineup-order';
import { eventIcon } from './commentary-icons';
import { Tooltip } from '@/components/ui/Tooltip';
import { eventCodeFromTypeName } from '@/lib/event-code';

import { resolveSide } from './match-event-side';
import { formatMatchMinute, resolveMarkerMinute, type InjuryWindow } from './match-timeline';

/**
 * Types out the newest event in LIVE mode only - the report has already
 * finished, so its whole feed appears at once and `typed` stays false.
 * Older bubbles receive false and render in full immediately.
 */
function useTypedText(text: string, typed: boolean): string {
  const [shown, setShown] = React.useState(typed ? 0 : text.length);
  React.useEffect(() => {
    if (!typed) {
      setShown(text.length);
      return;
    }
    setShown(0);
    const step = Math.max(12, Math.round(2400 / Math.max(1, text.length)));
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= text.length) window.clearInterval(timer);
    }, step);
    return () => window.clearInterval(timer);
  }, [text, typed]);
  return typed ? text.slice(0, shown) : text;
}

function TypedText({ text }: { text: string }) {
  return <>{useTypedText(text, true)}</>;
}

interface IntroPlayer {
  name?: string;
  position?: string;
}

/**
 * The two team sheets printed under the line-ups line.
 *
 * The intro event already ships both starting elevens (`homePlayers` /
 * `awayPlayers`, each with `name` + `position`), but the feed used to
 * reduce them to "11 vs 11 names" — the reader could never learn who was
 * actually playing. Two columns on desktop, stacked on narrow screens,
 * position first because that is how a team sheet is read.
 */
function PlayerIntroSheets({
  data,
  homeTeamName,
  awayTeamName,
  homeColor,
  awayColor,
}: {
  data: Record<string, unknown> | null | undefined;
  homeTeamName: string;
  awayTeamName: string;
  homeColor?: string | null;
  awayColor?: string | null;
}) {
  const home = (data?.homePlayers as IntroPlayer[] | undefined) ?? [];
  const away = (data?.awayPlayers as IntroPlayer[] | undefined) ?? [];
  if (home.length === 0 && away.length === 0) return null;

  // The engine hands the XI over in slot-code order (CB, CF, CM, GK, …);
  // a team sheet reads keeper first, then back line → midfield → attack.
  const sheets = [
    { key: 'home', team: homeTeamName, players: sortLineup(home), color: homeColor },
    { key: 'away', team: awayTeamName, players: sortLineup(away), color: awayColor },
  ];

  return (
    <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
      {sheets.map(({ key, team, players, color }) => {
        if (players.length === 0) return null;
        const formation = formationOf(players);
        return (
          <div key={key} className="min-w-0">
            <p className="flex items-baseline gap-1.5 text-kicker uppercase tracking-[0.14em] text-on-surface-variant">
              <span
                aria-hidden
                className="inline-block size-1.5 shrink-0 translate-y-[-1px] rounded-full"
                style={color ? { backgroundColor: color } : undefined}
              />
              <span className="truncate">{team}</span>
              {formation ? (
                <span className="shrink-0 font-mono text-[10px] tracking-normal text-on-surface-variant/55">
                  · {formation}
                </span>
              ) : null}
            </p>
            <ul className="mt-1">
              {players.map((p, i) => {
                // A little air when the line changes, so the sheet reads as
                // keeper / defence / midfield / attack instead of 11 rows.
                const newLine = i > 0 && lineOf(p.position) !== lineOf(players[i - 1].position);
                return (
                  <li
                    key={`${key}-${i}-${p.name ?? ''}`}
                    className={`flex items-baseline gap-1.5 text-label leading-snug ${
                      newLine ? 'mt-1.5' : ''
                    }`}
                  >
                    <span className="w-8 shrink-0 font-mono text-[10px] uppercase tracking-wide text-on-surface-variant/70">
                      {p.position ?? ''}
                    </span>
                    <span className="truncate text-on-surface">{p.name ?? ''}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export interface EventBubbleProps {
  typed?: boolean;
  event: MatchEvent;
  homeTeamName: string;
  awayTeamName: string;
  /**
   * The actual home/away team ids. The simulator payload only ships
   * `teamId` on each event — there is no `isHome` boolean — so the
   * bubble has to derive side by comparing `event.teamId` to these.
   * Without these, every team-attributed event would be misread as
   * away (because `event.isHome` is `undefined` and the fallback in
   * the old code treated that as away). Optional for backwards-compat
   * with any callers that only know the names.
   */
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeColor?: string | null;
  awayColor?: string | null;
  /**
   * Stoppage windows derived from the same `events` list the bubble
   * is rendered from. Used to format the minute column with the
   * "+N" suffix for events that land in 1H / 2H / ET stoppage time
   * (e.g. "45+1'" instead of "46'"). Optional for backwards-compat;
   * the bubble falls back to the raw minute when the windows array
   * is missing / empty (e.g. live matches where the half_time /
   * full_time events haven't fired yet).
   */
  injuryWindows?: InjuryWindow[];
  /**
   * True when the progress strip or the key-events column has picked this
   * event. The row gets a wash + ring and scrolls itself into view, because
   * the picked event is often off-screen (a live feed scrolls inside a
   * viewport-sized box, a finished report is a long page) — highlighting
   * something nobody can see would read as "nothing happened".
   */
  isSelected?: boolean;
  /** Click handler that reports this row as the selected event. */
  onSelect?: () => void;
  /** Venue name of the match — only the crowd announcement uses it. */
  venue?: string | null;
  /** Stadium capacity of the match — only the crowd announcement uses it. */
  capacity?: number | null;
}

export const EventBubble: React.FC<EventBubbleProps> = ({
  typed,
  event,
  homeTeamName,
  awayTeamName,
  homeTeamId,
  awayTeamId,
  homeColor,
  awayColor,
  injuryWindows,
  isSelected = false,
  onSelect,
  venue,
  capacity,
}) => {
  const t = useTranslations('commentary');
  const rowRef = useRef<HTMLDivElement | null>(null);

  // Bring the picked row into view. Runs when the selection *becomes* this
  // row, so re-renders caused by new live events don't yank the feed around.
  useEffect(() => {
    if (!isSelected) return;
    rowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [isSelected]);
  const type = canonicalEventType(event.typeName ?? event.type);

  // Note: every non-snapshot event is rendered in the chronological
  // feed (goals, red cards, subs, period transitions all included).
  // The previous "spotlight" filtering + dedicated spotlight card was
  // removed in D5 — the EventBubble is the single rendering path.
  const Icon = eventIcon(type, event.data);
  const text =
    formatEventCommentary(event, homeTeamName, awayTeamName, t, {
      venue,
      capacity,
      homeTeamId,
      awayTeamId,
    }) ?? '';
  // Hover label: lane · shot type · outcome, e.g. 中路 · 抽射 · 进球.
  // The full sentence is already in the row, so repeating it in the bubble
  // would only push the bubble wide enough to cover the panel.
  const laneKey = (event.data as { lane?: string } | null)?.lane;
  const shotKey = (event.data as { shot?: { shotType?: string } } | null)?.shot?.shotType;
  const outcomeKey = /GOAL/.test(type)
    ? 'goal'
    : /SAVE/.test(type)
      ? 'save'
      : /MISS|OFF_TARGET/.test(type)
        ? 'miss'
        : null;
  const isShot = Boolean(laneKey || shotKey || outcomeKey);
  const shotLabel = [
    laneKey ? t(`lane.${laneKey.toLowerCase()}`) : null,
    shotKey ? t(`shotType.${shotKey.toLowerCase()}`) : null,
    outcomeKey ? t(`outcome.${outcomeKey}`) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const hoverLabel = isShot
    ? shotLabel
    : t('label.' + String(event.typeName ?? event.type).toLowerCase());
  if (!text) return null;

  // Side derivation — shared rule with `MatchKeyEvents` via
  // `match-event-side.ts`. See that file for the full precedence order
  // and the rationale for the 'neutral' default (the old ternary
  // chain silently lied about meta events like KICKOFF).
  const side = resolveSide(event, homeTeamId, awayTeamId);
  const isHome = side === 'home';
  const isAway = side === 'away';

  // Tones. Home / away / neutral each get their own colour identity so
  // a single left-aligned column of events still reads as a transcript
  // with at-a-glance team attribution. Falls back to the theme's
  // primary / secondary when the caller didn't supply team colours.
  //
  // Three signals are stacked so the side is unmistakable:
  //   1. A 4px solid left bar (the most visible cue)
  //   2. A coloured "team dot" right of the minute
  //   3. A coloured row tint + minute/icon colour for redundancy
  const teamColor = isHome ? homeColor : isAway ? awayColor : null;
  // For the left bar we *prefer* the team-supplied colour (if any)
  // and otherwise fall back to the theme primary/secondary token. Note
  // we use bg-primary / bg-secondary rather than text-primary, because
  // the bar is a coloured chip, not typography.
  const minuteStyle = teamColor
    ? { color: teamColor }
    : undefined;
  // Row tint — removed per design feedback. The left bar + minute
  // dot are enough to convey home/away at a glance, and the row
  // background was overpowering the surrounding `bg-surface-
  // container-lowest` shell on long feeds. Keep the tone-derivation
  // logic in case we want to re-introduce it later, but no class is
  // applied to the row itself.
  const eventCode = eventCodeFromTypeName(
    event.typeName ?? String(event.type),
  );
  // Goal rows get a faint wash so the eye can find them while scanning;
  // everything else stays on the panel surface. A row picked from the
  // strip or the key-events column overrides the tint with a stronger
  // primary wash + ring, so "the event you clicked" is unambiguous.
  const rowTint = eventCode.indexOf('.GOAL') >= 0 ? 'bg-primary/[0.06] rounded-md' : '';
  const rowState = isSelected
    ? 'bg-primary/10 ring-1 ring-inset ring-primary/40 rounded-md'
    : rowTint;
  const iconTone = isHome
    ? 'text-primary'
    : isAway
    ? 'text-secondary'
    : 'text-on-surface-variant';

  // Layout: every event is the same shape — a 4px team bar, a fixed-
  // width minute column (with a coloured dot), then a 1fr content
  // column. Side is encoded by colour on every element, not by
  // alignment, so the feed always reads top-to-bottom in chronological
  // order and every row is left-aligned regardless of which team did
  // the action.
  // Clicking a row selects it, but the row is deliberately NOT a tab stop:
  // a 60-event feed would add 60 stops between the strip and the rest of the
  // page. The strip cells and the key-events rows are the keyboard path into
  // the same selection state.
  return (
    <div
      ref={rowRef}
      data-event-id={event.id ?? undefined}
      data-selected={isSelected ? 'true' : undefined}
      onClick={onSelect}
      className={`relative grid grid-cols-[44px_1fr] items-start gap-2 py-1.5 transition-colors ${rowState} ${
        onSelect ? 'cursor-pointer hover:bg-white/[0.03]' : ''
      }`}
    >
      {/* 2. Minute — fixed-width column, mono numerals, team colour,
             with a coloured dot before the number so the side reads
             even if the rest of the row scrolls out of view. */}
      <div className="flex items-start justify-end pt-0.5">
        <span
          className={`inline-flex h-[22px] w-[34px] items-center justify-center gap-px rounded-md font-mono text-[11px] font-black tabular-nums ${isHome ? 'bg-primary/20 text-primary' : isAway ? 'bg-secondary/20 text-secondary' : 'bg-surface-container-high/60 text-on-surface-variant'}`}
          style={minuteStyle}
        >
          {formatMatchMinute(
            resolveMarkerMinute(event),
            injuryWindows ?? [],
            (event.data as { period?: string } | undefined)?.period,
          )}
          <sup className="text-[8px] font-bold leading-none">&#39;</sup>
        </span>
      </div>

      {/* 3. Content — icon + text */}
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <span className={`shrink-0 flex h-6 w-6 items-center justify-center ${iconTone}`}>
            <Tooltip
                    side="top"
                    align="end"
                    wrap
                    portal
                    label={
                      <span className="flex flex-col gap-0.5">
                        <span>{hoverLabel}</span>
                        <span className="font-mono text-[10px] tracking-wider text-on-surface/50">
                          {eventCode}
                        </span>
                      </span>
                    }
                  >
                    <span className="inline-flex">{React.createElement(Icon, { size: 24 })}</span>
                  </Tooltip>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-body leading-snug text-on-surface">
            {typed ? <TypedText text={text} /> : <LinkedPlayerText text={text} event={event} />}
          </p>
            {type === 'PLAYER_INTRODUCTION' ? (
              <PlayerIntroSheets
                data={event.data}
                homeTeamName={homeTeamName}
                awayTeamName={awayTeamName}
                homeColor={homeColor}
                awayColor={awayColor}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
