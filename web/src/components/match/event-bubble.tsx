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
import { Tooltip } from '@/components/ui/Tooltip';
import { eventCodeFromTypeName } from '@/lib/event-code';

import { resolveSide } from './match-event-side';
import { formatMatchMinute, resolveMarkerMinute, type InjuryWindow } from './match-timeline';

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
}

export const EventBubble: React.FC<EventBubbleProps> = ({
  event,
  homeTeamName,
  awayTeamName,
  homeTeamId,
  awayTeamId,
  homeColor,
  awayColor,
  injuryWindows,
}) => {
  const t = useTranslations('commentary');
  const type = canonicalEventType(event.typeName ?? event.type);

  // Note: every non-snapshot event is rendered in the chronological
  // feed (goals, red cards, subs, period transitions all included).
  // The previous "spotlight" filtering + dedicated spotlight card was
  // removed in D5 — the EventBubble is the single rendering path.
  const Icon = eventIcon(type);
  const text = formatEventCommentary(event, homeTeamName, awayTeamName, t) ?? '';
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
  // everything else stays on the panel surface.
  const rowTint = eventCode.indexOf('.GOAL') >= 0 ? 'bg-primary/[0.06] rounded-md' : '';
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
  return (
    <div
      className={`relative grid grid-cols-[40px_1fr] items-start gap-2 py-1.5 ${rowTint}`}
    >
      {/* 2. Minute — fixed-width column, mono numerals, team colour,
             with a coloured dot before the number so the side reads
             even if the rest of the row scrolls out of view. */}
      <div className="flex items-start justify-end pt-0.5">
        <span
          className={`inline-flex h-[22px] min-w-[32px] items-center justify-center rounded-md px-1 font-mono text-[11px] font-black tabular-nums ${isHome ? 'bg-primary/12 text-primary' : isAway ? 'bg-secondary/12 text-secondary' : 'bg-surface-container-high/60 text-on-surface-variant'}`}
          style={minuteStyle}
        >
          {formatMatchMinute(
            resolveMarkerMinute(event),
            injuryWindows ?? [],
            (event.data as { period?: string } | undefined)?.period,
          )}
          &apos;
        </span>
      </div>

      {/* 3. Content — icon + text */}
      <div className="min-w-0">
        <div className="flex items-start gap-1.5">
          <span className={`shrink-0 flex h-[18px] items-center ${iconTone}`}>
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
                    <span className="inline-flex">{React.createElement(Icon, { size: 20 })}</span>
                  </Tooltip>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-body leading-snug text-on-surface">{text}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
