/**
 * Pure helper for `MatchKeyEvents`. Kept in a `.ts` file (no React) so
 * it can be unit-tested under the current Jest setup, which is
 * deliberately scoped to pure functions and doesn't transform `.tsx`
 * (see `web/jest.config.ts`).
 */
import type { MatchEvent } from '@/lib/api';
import { resolveSide, type EventSide } from './match-event-side';
import { formatSpecialtyBonus } from '@/lib/specialty-bonus';
import { getSpecialtyLabel } from '@/lib/specialties';

export type EventEntry = {
  minute: number;
  icon: string;
  label: string;
  sublabel?: string;
  /**
   * RFC 0003 — Specialty Attribution. When the event had a
   * specialty effect (e.g. an AERIAL_THREAT player's header
   * goal), the chip carries the player-facing copy: the
   * specialty display name (e.g. "空霸") + the formatted
   * percent bonus (e.g. "+14% 效果"). The chip is rendered by
   * `MatchKeyEvents` next to the player name. `undefined`
   * for the ~90% of events with no specialty effect.
   */
  specialtyChip?: {
    code: string;
    label: string;
    bonusText: string;
    tier: 'GOLD' | 'SILVER' | 'BRONZE';
  };
  /** Always 'home' or 'away' — neutral events (KICKOFF, etc.) aren't goals/cards/subs so
   *  they never reach this list, so the union is tighter than `EventSide`. */
  side: 'home' | 'away';
};

export function extractKeyEvents(
  events: MatchEvent[],
  rosterById: Map<string, { name: string }>,
  homeTeamId?: string | null,
  awayTeamId?: string | null,
): EventEntry[] {
  const GOAL_TYPES = ['goal', 'own_goal'];
  const CARD_TYPES = ['yellow_card', 'second_yellow', 'red_card'];
  const SUB_TYPES = ['substitution'];
  // Player going down is a match-defining moment (forces a sub,
  // shapes possession, etc.) so it deserves a row here alongside
  // goals / cards / subs. Was previously missing from the sidebar
  // even though `formatInjuryCommentary` already produced the text
  // for the commentary feed — leaving the right rail out of sync
  // with the centre column.
  const INJURY_TYPES = ['injury'];
  const entries: EventEntry[] = [];

  // Resolve a player's display name from the event payload + roster map.
  // `ev.playerId` is a runtime number (the entity column is `int`), so we
  // stringify before the Map lookup — the map is keyed by `String(p.id)`,
  // see `MatchLiveView.rosterByIdForKeys`. The old `ev.playerId?.slice(0, 6)`
  // fallback threw a `TypeError` the moment a real substitution arrived,
  // because `Number.prototype.slice` doesn't exist.
  const resolveName = (
    ev: MatchEvent,
    dataNameKey: 'playerName' | 'substitutePlayerName' | 'playerIn',
  ): string => {
    const fromData = ev.data?.[dataNameKey] as string | undefined;
    if (fromData) return fromData;
    const fromRoster = ev.playerId != null ? rosterById.get(String(ev.playerId))?.name : undefined;
    return fromRoster ?? '?';
  };

  for (const ev of events) {
    const type = ev.typeName?.toLowerCase() ?? '';
    // Side derivation lives in `resolveSide` (see match-event-side.ts) so
    // the same rule is shared with the commentary feed's `EventBubble`.
    // Neutral events can't be GOAL / CARD / SUB so we never reach the
    // entries.push with `side: 'neutral'` below, but we narrow the type
    // here anyway to keep the row tinting strict.
    const resolved: EventSide = resolveSide(ev, homeTeamId, awayTeamId);
    const side: 'home' | 'away' = resolved === 'away' ? 'away' : 'home';

    // RFC 0003 — pick the headline (primary) specialty chip for
    // this event, if any. D8: at most one primary per event; the
    // engine guarantees index 0 in `specialtyContributions` is
    // it. If there's no contribution array or it's empty, the
    // chip stays undefined and no UI surface is shown.
    const primary = ev.specialtyContributions?.find((c) => c.isPrimary);
    const specialtyChip = primary
      ? (() => {
          const bonus = formatSpecialtyBonus(primary.multiplier);
          if (!bonus) return undefined; // mult was 1.0 somehow
          const label = getSpecialtyLabel(primary.specialtyCode, 'zh') ?? primary.specialtyCode;
          return {
            code: primary.specialtyCode,
            label,
            bonusText: bonus,
            tier: primary.tier,
          };
        })()
      : undefined;

    if (GOAL_TYPES.includes(type)) {
      const scorer = resolveName(ev, 'playerName');
      const assist = ev.data?.assistName;
      entries.push({
        minute: ev.minute,
        icon: '⚽',
        label: scorer + (assist ? `  ·  A: ${assist}` : ''),
        sublabel: type === 'own_goal' ? 'OG' : undefined,
        specialtyChip,
        side,
      });
    } else if (CARD_TYPES.includes(type)) {
      const player = resolveName(ev, 'playerName');
      const cardType =
        type === 'second_yellow' ? '2nd Yellow' : type === 'red_card' ? 'Red' : 'Yellow';
      entries.push({
        minute: ev.minute,
        icon: type === 'red_card' ? '🟥' : '🟨',
        label: player,
        sublabel: cardType,
        // Cards don't surface specialty chips in v1 (a TACKLER
        // fouling is the most common case but the engine doesn't
        // record `foul_rate` reductions per RFC 0003 §4.2). The
        // field is left undefined — `MatchKeyEvents` skips
        // undefined chips.
        side,
      });
    } else if (SUB_TYPES.includes(type)) {
      const playerIn = resolveName(ev, 'substitutePlayerName');
      const playerOut = ev.data?.playerOut ?? '?';
      entries.push({
        minute: ev.minute,
        icon: '⇄',
        label: playerIn,
        sublabel: `↔ ${playerOut}`,
        side,
      });
    } else if (INJURY_TYPES.includes(type)) {
      const player = resolveName(ev, 'playerName');
      // `severity` comes through as a number from the simulator; the
      // existing InjuryBadge component handles the "minor"/"severe"
      // bucketing. We just surface a short label here.
      const severity = ev.data?.severity;
      const sublabel =
        severity === 'minor' || severity === 'severe' ? severity : undefined;
      entries.push({
        minute: ev.minute,
        icon: '🚑',
        label: player,
        sublabel,
        side,
      });
    }
  }

  return entries;
}
