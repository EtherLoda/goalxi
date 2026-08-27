/**
 * Pure helper for `MatchKeyEvents`. Kept in a `.ts` file (no React) so
 * it can be unit-tested under the current Jest setup, which is
 * deliberately scoped to pure functions and doesn't transform `.tsx`
 * (see `web/jest.config.ts`).
 *
 * `icon` is a React.FC component (not a string glyph) so the sidebar
 * can render the D-style chunky SVG set from `commentary-icons.tsx`
 * instead of the previous emoji set. The component is a value, not a
 * rendered element, so the helper stays test-friendly: assertions
 * compare component identity (`toBe(GoalCenterIcon)`), not rendered
 * markup.
 */
import type { MatchEvent } from '@/lib/api';
import { resolveSide, type EventSide } from './match-event-side';
import { formatSpecialtyBonus } from '@/lib/specialty-bonus';
import { getSpecialtyLabel } from '@/lib/specialties';
import { resolveMarkerMinute } from './match-timeline';
import {
  GoalCenterIcon,
  MissCenterIcon,
  SaveIcon,
  TurnoverIcon,
  YellowCardIcon,
  RedCardIcon,
  SubstitutionIcon,
  InjuryIcon,
  type CommentaryIconProps,
} from './commentary-icons';

export type EventEntry = {
  minute: number;
  /**
   * D-style SVG icon component. The sidebar renders it with
   * `<entry.icon size={13} />`. One of the goal / shot / card / sub /
   * injury family — the helper never returns a non-key event.
   */
  icon: React.FC<CommentaryIconProps>;
  /**
   * RFC 0002 classId + outcomeId tuple. Rendered as a `title`
   * tooltip on the icon so the user can hover to verify which
   * underlying category each row belongs to (debug / dev
   * affordance — the helper is also the test surface for the
   * classification contract).
   *
   * `outcomeId` is `null` for class-only events (INJURY, OWN_GOAL,
   * KICKOFF, etc. — the outcome lives in `data` JSONB). The fields
   * are `number | null | undefined` to match the underlying
   * `MatchEvent` shape (the source columns are nullable, the FE
   * DTO marks them optional).
   */
  classId: number | null | undefined;
  outcomeId: number | null | undefined;
  /**
   * Short, human-readable outcome tag pulled from the event's
   * `outcomeCode` (RFC 0002). Shown in the icon `title` only —
   * kept here for test pin + tooltip composition. The user-facing
   * sublabel on the row still comes from the category-specific
   * sublabel field below.
   */
  outcomeCode: string | null | undefined;
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

/**
 * RFC 0002 — Two-Axis Event Coding. Classify an event into the
 * key-event categories the sidebar cares about. Prefers the
 * new (eventClassId, outcomeId) tuple when present; falls
 * back to the legacy `typeName` string for rows from before
 * Phase 2 shipped.
 *
 * The class ids and outcome ids come from
 * `libs/database/src/constants/event-two-axis.ts` — keep
 * them in sync.
 *
 * Categories:
 *   - goal        — shot that scored (incl. own goal + penalty goal)
 *   - shot        — shot that didn't score (saved / missed / turnover
 *                   / penalty miss). Pre-duel `shot_on_target` rows
 *                   (classId=3, outcomeId=null) are NOT classified —
 *                   they're a transition state the engine later
 *                   resolves to goal / save / miss, so showing them
 *                   would duplicate the row.
 *   - card        — foul that drew a card (yellow / 2nd yellow / red)
 *   - substitution — player swap
 *   - injury      — player injury
 */
type EventCategory = 'goal' | 'shot' | 'card' | 'substitution' | 'injury' | null;

function classifyEvent(ev: MatchEvent): EventCategory {
  // RFC 0002 Phase 3 — the new (eventClassId, outcomeId)
  // tuple is the SINGLE source of truth. The legacy typeName
  // fallback is gone. Every event (whether written by the
  // Phase 2+ engine or backfilled by the Phase 1 SQL
  // function) has the tuple populated.
  if (ev.eventClassId == null) {
    // Defensive: a row with no classId is malformed and
    // must not classify as anything. Phase 3 set
    // event_class_id NOT NULL so this case shouldn't exist
    // in production; the null check is here for tests
    // that build raw event objects without the tuple.
    return null;
  }
  // GOAL: class SHOT(3) or PENALTY(7) + outcome GOAL(1), or
  //       class OWN_GOAL(11) (outcome is null there — the
  //       data field carries the "scored into own net" flag).
  if (
    ((ev.eventClassId === 3 || ev.eventClassId === 7) && ev.outcomeId === 1) ||
    ev.eventClassId === 11
  ) {
    return 'goal';
  }
  // SHOT (no goal): class SHOT(3) with a non-GOAL outcome —
  //   outcomeId=2 (SAVE)   → GK saved
  //   outcomeId=4 (MISS)   → off-target / blocked / cleared
  //   outcomeId=null (pre-duel shot_on_target) → NOT classified.
  //     The engine will resolve this to goal / save / miss and
  //     the resolved row already classifies; showing the
  //     pre-duel row would double-list the same physical event.
  // Plus class PENALTY(7) + outcomeId=4 (penalty miss).
  if (
    (ev.eventClassId === 3 && (ev.outcomeId === 2 || ev.outcomeId === 4)) ||
    (ev.eventClassId === 7 && ev.outcomeId === 4)
  ) {
    return 'shot';
  }
  // CARD: class FOUL(4) + outcome YELLOW(6) / SECOND_YELLOW(7) / RED(8)
  if (
    ev.eventClassId === 4 &&
    (ev.outcomeId === 6 || ev.outcomeId === 7 || ev.outcomeId === 8)
  ) {
    return 'card';
  }
  // SUBSTITUTION: class SUBSTITUTION(8)
  if (ev.eventClassId === 8) return 'substitution';
  // INJURY: class INJURY(9)
  if (ev.eventClassId === 9) return 'injury';
  return null;
}

export function extractKeyEvents(
  events: MatchEvent[],
  rosterById: Map<string, { name: string }>,
  homeTeamId?: string | null,
  awayTeamId?: string | null,
): EventEntry[] {
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

    // RFC 0002 — Two-Axis Event Coding. `classifyEvent` prefers
    // the new (eventClassId, outcomeId) tuple and falls back to
    // typeName for legacy rows. The specific kind within a
    // category (own goal vs goal, red card vs yellow) is still
    // derived from `typeName` because the new tuple's
    // outcomeId-→kind mapping isn't exhaustive enough yet (e.g.
    // distinguishing own goal from regular goal would require
    // a separate outcome id). The tuple gives us the category,
    // typeName gives us the sub-kind — both are stable for the
    // 1-week Phase 2 soak.
    const category = classifyEvent(ev);
    const typeName = ev.typeName?.toLowerCase() ?? '';

    if (category === 'goal') {
      const scorer = resolveName(ev, 'playerName');
      const assist = ev.data?.assistName;
      // PENALTY_GOAL gets a "Penalty" sublabel so the row reads
      // as a spot-kick goal (otherwise it's identical to a regular
      // goal in the icon + name). OWN_GOAL keeps the existing "OG"
      // sublabel.
      const goalSublabel =
        typeName === 'own_goal' ? 'OG'
          : typeName === 'penalty_goal' ? 'Penalty'
            : undefined;
      entries.push({
        minute: resolveMarkerMinute(ev),
        classId: ev.eventClassId,
        outcomeId: ev.outcomeId,
        outcomeCode: ev.outcomeCode,
        // D-style: buckyball + green ▲. The engine doesn't yet emit a
        // ball-side / zone hint on goal events, so the centre variant
        // is the safe default. When/if it does, swap to the L/R
        // variant from `commentary-icons` (no helper change needed).
        icon: GoalCenterIcon,
        label: scorer + (assist ? `  ·  A: ${assist}` : ''),
        sublabel: goalSublabel,
        specialtyChip,
        side,
      });
    } else if (category === 'shot') {
      // SHOT that didn't score. Icon + sublabel depend on the
      // outcome (or the typeName for the turnover case):
      //   - classId=3 + outcomeId=2  → SaveIcon,    "Saved"
      //   - classId=3 + outcomeId=4 + typeName='turnover' → TurnoverIcon, "Turnover"
      //   - classId=3 + outcomeId=4  → MissCenterIcon, "Missed"  (shot_off_target / miss)
      //   - classId=7 + outcomeId=4  → MissCenterIcon, "Penalty miss"  (penalty_miss)
      //
      // The shooter is the player on the event. Unlike GOAL we
      // don't have a `data.assistName` for shot rows (the assist
      // is recorded on the FOLLOW-UP goal row, not the shot
      // itself), so the label is just the player name.
      const shooter = resolveName(ev, 'playerName');
      const isTurnover = typeName === 'turnover';
      const isPenaltyMiss = ev.eventClassId === 7;
      const shotIcon = ev.outcomeId === 2
        ? SaveIcon
        : isTurnover
          ? TurnoverIcon
          : MissCenterIcon;
      const shotSublabel = ev.outcomeId === 2
        ? 'Saved'
        : isTurnover
          ? 'Turnover'
          : isPenaltyMiss
            ? 'Penalty miss'
            : 'Missed';
      entries.push({
        minute: resolveMarkerMinute(ev),
        classId: ev.eventClassId,
        outcomeId: ev.outcomeId,
        outcomeCode: ev.outcomeCode,
        icon: shotIcon,
        label: shooter,
        sublabel: shotSublabel,
        side,
      });
    } else if (category === 'card') {
      const player = resolveName(ev, 'playerName');
      const cardType =
        typeName === 'second_yellow'
          ? '2nd Yellow'
          : typeName === 'red_card'
            ? 'Red'
            : 'Yellow';
      entries.push({
        minute: resolveMarkerMinute(ev),
        classId: ev.eventClassId,
        outcomeId: ev.outcomeId,
        outcomeCode: ev.outcomeCode,
        // D-style chunky card glyphs: YellowCardIcon (yellow rect +
        // navy outline + dark stripe) / RedCardIcon (same shape, red
        // fill). The two-second-yellow case is rendered as a red card
        // in the live match (the player walks) so we map it to the
        // red glyph, not a yellow-on-yellow.
        icon: typeName === 'red_card' || typeName === 'second_yellow' ? RedCardIcon : YellowCardIcon,
        label: player,
        sublabel: cardType,
        // Cards don't surface specialty chips in v1 (a TACKLER
        // fouling is the most common case but the engine doesn't
        // record `foul_rate` reductions per RFC 0003 §4.2). The
        // field is left undefined — `MatchKeyEvents` skips
        // undefined chips.
        side,
      });
    } else if (category === 'substitution') {
      const playerIn = resolveName(ev, 'substitutePlayerName');
      const playerOut = ev.data?.playerOut ?? '?';
      entries.push({
        minute: resolveMarkerMinute(ev),
        classId: ev.eventClassId,
        outcomeId: ev.outcomeId,
        outcomeCode: ev.outcomeCode,
        // D-style: red ← (out) on the left + green → (in) on the
        // right, horizontal. Larger silhouette than the v1 ⇄ emoji
        // so the row reads as a sub at a glance.
        icon: SubstitutionIcon,
        label: playerIn,
        sublabel: `↔ ${playerOut}`,
        side,
      });
    } else if (category === 'injury') {
      const player = resolveName(ev, 'playerName');
      // `severity` comes through as a number from the simulator; the
      // existing InjuryBadge component handles the "minor"/"severe"
      // bucketing. We just surface a short label here.
      const severity = ev.data?.severity;
      const sublabel =
        severity === 'minor' || severity === 'severe' ? severity : undefined;
      entries.push({
        minute: resolveMarkerMinute(ev),
        classId: ev.eventClassId,
        outcomeId: ev.outcomeId,
        outcomeCode: ev.outcomeCode,
        // D-style: red rounded box with white cross. Replaces the 🚑
        // emoji so the row reads as medical attention (the cross
        // icon is the international medical symbol, not an
        // ambulance).
        icon: InjuryIcon,
        label: player,
        sublabel,
        side,
      });
    }
  }

  return entries;
}
