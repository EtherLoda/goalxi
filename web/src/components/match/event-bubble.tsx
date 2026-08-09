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

import React from 'react';
import { useTranslations } from 'next-intl';
import type { MatchEvent } from '@/lib/api';
import { canonicalEventType, formatEventCommentary } from '@/lib/commentary';
import { eventIcon } from './commentary-icons';

export interface EventBubbleProps {
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
}

const STAT_RE = /(shootRating|gkRating|attackScore|defenseScore|probability)=([\d.]+)/;

export const EventBubble: React.FC<EventBubbleProps> = ({
  event,
  homeTeamName,
  awayTeamName,
  homeTeamId,
  awayTeamId,
  homeColor,
  awayColor,
}) => {
  const t = useTranslations('commentary');
  const type = canonicalEventType(event.typeName ?? event.type);

  // Note: we intentionally do NOT filter `isSpotlightEvent(type)` here
  // anymore — the user wants every non-snapshot event in the
  // chronological feed (goals, red cards, subs, period transitions
  // all included). The goal-spotlight card is hidden via `hidden` in
  // LiveCommentary but the icon mapping is still useful here for
  // visual consistency.
  const Icon = eventIcon(type);
  const text = formatEventCommentary(event, homeTeamName, awayTeamName, t) ?? '';
  if (!text) return null;

  // Side derivation. The simulator's gateway payload only ships
  // `teamId` on each event — there is no `isHome` boolean. Trust
  // `isHome` if it's there, otherwise compare `event.teamId` against
  // the match's home/away ids. Falling back to "false" silently
  // misreads home events as away (which is exactly what the old
  // `event.isHome ?? false` line did).
  const isHome =
    event.isHome === true ||
    (event.isHome == null && homeTeamId != null && event.teamId === homeTeamId);
  const isAway =
    !isHome &&
    (event.isHome === false ||
      (event.isHome == null && awayTeamId != null && event.teamId === awayTeamId) ||
      (event.isHome == null && event.teamId != null));
  const isNeutral = !isHome && !isAway;

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
  const barClass = isHome
    ? 'bg-primary'
    : isAway
    ? 'bg-secondary'
    : 'bg-outline/40';
  const barStyle = teamColor
    ? { backgroundColor: teamColor }
    : undefined;
  const minuteTone = isHome
    ? 'text-primary'
    : isAway
    ? 'text-secondary'
    : 'text-on-surface-variant';
  const minuteStyle = teamColor
    ? { color: teamColor }
    : undefined;
  // Row tint — removed per design feedback. The left bar + minute
  // dot are enough to convey home/away at a glance, and the row
  // background was overpowering the surrounding `bg-surface-
  // container-lowest` shell on long feeds. Keep the tone-derivation
  // logic in case we want to re-introduce it later, but no class is
  // applied to the row itself.
  const rowTint = '';
  const iconTone = isHome
    ? 'text-primary'
    : isAway
    ? 'text-secondary'
    : 'text-on-surface-variant';

  const statMatch = text.match(STAT_RE);
  const statValue = statMatch ? statMatch[2] : null;

  // Layout: every event is the same shape — a 4px team bar, a fixed-
  // width minute column (with a coloured dot), then a 1fr content
  // column. Side is encoded by colour on every element, not by
  // alignment, so the feed always reads top-to-bottom in chronological
  // order and every row is left-aligned regardless of which team did
  // the action.
  return (
    <div
      className={`relative grid grid-cols-[6px_44px_1fr] items-stretch gap-2 py-1.5 pl-1 pr-1 rounded-r-md ${rowTint}`}
    >
      {/* 1. Team bar — solid 4px coloured strip on the left */}
      <div
        className={`rounded-sm ${barClass}`}
        style={barStyle}
        aria-hidden
      />

      {/* 2. Minute — fixed-width column, mono numerals, team colour,
             with a coloured dot before the number so the side reads
             even if the rest of the row scrolls out of view. */}
      <div className="flex items-center justify-end gap-1 pt-0.5">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${barClass}`}
          style={barStyle}
          aria-hidden
        />
        <span
          className={`font-mono font-black text-[11px] tabular-nums ${minuteTone}`}
          style={minuteStyle}
        >
          {event.minute}&apos;
        </span>
      </div>

      {/* 3. Content — icon + text + optional stat */}
      <div className="min-w-0 pl-1">
        <div className="flex items-start gap-1.5">
          <span className={`shrink-0 mt-0.5 ${iconTone}`}>
            {React.createElement(Icon, { size: 13 })}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs leading-snug text-on-surface">{text}</p>
            {statValue && (
              <p className="mt-0.5 text-[10px] font-mono text-on-surface-variant/80">
                {statMatch![1]} = {statValue}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
