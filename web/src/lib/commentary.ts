import type { MatchEvent } from './api';
// RFC 0003 — Specialty Attribution. The goal commentary prepends
// a "空霸发威！+14% 效果！" tag when the engine's primary
// contribution is set. `getSpecialtyLabel` resolves the
// specialty code to a localized display name; `formatSpecialtyBonus`
// converts the tier-scaled multiplier to a player-facing percent
// string (the FE MUST NOT show the raw decimal per D9).
import { formatSpecialtyBonus } from './specialty-bonus';
import { getSpecialtyLabel } from './specialties';

type TranslationFunction = (key: string, params?: Record<string, string | number>) => string;

/**
 * [WAVE B4] Single source of truth for live-event type normalization.
 *
 * The simulator (simulator/src/engine/match.engine.ts) emits events using
 * lowercase_underscore `typeName` strings (e.g. `goal`, `miss`, `save`,
 * `yellow_card`, `second_half`). The formatter switch below dispatches on
 * canonical UPPER_CASE keys (e.g. `GOAL`, `SHOT_ON_TARGET`,
 * `SECOND_HALF_START`). Without this map, every miss / save / turnover would
 * fall through to the default branch and render ugly fallback text.
 *
 * Reasons some entries map to a non-obvious canonical key:
 *  - `miss`/`save` → simulator doesn't distinguish on/off target; map to the
 *    corresponding `SHOT_*_TARGET` arm so the formatter produces sensible text.
 *  - `penalty_goal` → counted as a goal for scoring (scheduler
 *    match-live.scheduler.ts:199); formatter dispatches the same way.
 *  - `second_half` → i18n key is `commentary.second_half_start.tpl_0`.
 *  - `forfeit`/`match_start` → legacy simulator names rarely seen in prod.
 *
 * Keys are UPPERCASE to match the canonical uppercase form `canonicalEventType`
 * uses after normalizing inputs. Iteration order matters for the spec that
 * asserts on map size.
 */
export const EVENT_TYPE_ALIAS = new Map<string, string>([
  ['GOAL', 'GOAL'],
  ['MISS', 'SHOT_OFF_TARGET'],
  ['SAVE', 'SHOT_ON_TARGET'],
  ['SHOT', 'SHOT_OFF_TARGET'],
  ['SHOT_ON_TARGET', 'SHOT_ON_TARGET'],
  ['SHOT_OFF_TARGET', 'SHOT_OFF_TARGET'],
  ['TURNOVER', 'TURNOVER'],
  ['ADVANCE', 'ADVANCE'],
  ['ATTACK_SEQUENCE', 'ATTACK_SEQUENCE'],
  ['SNAPSHOT', 'SNAPSHOT'],
  ['CORNER', 'CORNER'],
  ['FOUL', 'FOUL'],
  ['YELLOW_CARD', 'YELLOW_CARD'],
  ['SECOND_YELLOW', 'SECOND_YELLOW'],
  ['RED_CARD', 'RED_CARD'],
  ['OFFSIDE', 'OFFSIDE'],
  ['SUBSTITUTION', 'SUBSTITUTION'],
  ['INJURY', 'INJURY'],
  ['PENALTY', 'PENALTY'],
  ['PENALTY_GOAL', 'GOAL'],
  ['PENALTY_MISS', 'PENALTY_MISS'],
  ['KICKOFF', 'KICKOFF'],
  ['MATCH_START', 'KICKOFF'],
  ['HALF_TIME', 'HALF_TIME'],
  ['SECOND_HALF', 'SECOND_HALF_START'],
  ['FULL_TIME', 'FULL_TIME'],
  ['EXTRA_TIME_START', 'EXTRA_TIME_START'],
  ['PENALTY_START', 'PENALTY_START'],
  ['TACTICAL_CHANGE', 'TACTICAL_CHANGE'],
  ['FREE_KICK', 'FREE_KICK'],
  ['WEATHER_ANNOUNCEMENT', 'WEATHER_ANNOUNCEMENT'],
  ['ATTENDANCE_ANNOUNCEMENT', 'ATTENDANCE_ANNOUNCEMENT'],
  ['PLAYER_INTRODUCTION', 'PLAYER_INTRODUCTION'],
  ['FORFEIT', 'FORFEIT'],
]);

/**
 * Resolve a raw simulator type string to the canonical uppercase switch key.
 * Falls back to the raw upper-cased value so unknown events still route through
 * the default branch (which produces ugly but non-broken text).
 */
export function canonicalEventType(raw: string | undefined | null): string {
  const norm = (raw ?? '').toUpperCase().replace(/-/g, '_');
  return EVENT_TYPE_ALIAS.get(norm) ?? norm;
}

/**
 * [WAVE B4] Deterministic djb2 hash for stable per-event variation indices.
 *
 * The simulator used to attach a `descriptionIndex` field per event for
 * picking among `tpl_0..tpl_N` templates, but that field never crosses the
 * WS gateway boundary (no entity column, no transport field). Without it,
 * every event collapsed to index 1, killing narrative variety.
 *
 * Hashing the event's stable key (its server-emitted UUID, or the same
 * `(type, minute, playerId, teamId)` tuple the dedupe map uses as fallback)
 * yields per-event indices that are stable across re-renders but vary across
 * events — i.e. the visible behavior the original `descriptionIndex` was
 * supposed to provide, without needing backend schema changes.
 */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function stableEventKey(event: MatchEvent): string {
  // Use `||` (not `??`) so empty-string ids (which the gateway can emit
  // when its Phase 1 emission rolls out unevenly) fall back to the
  // composite tuple. With `??`, an empty id passes through and all
  // id-less events collapse to the same hash — which would kill the per-
  // event template variation the hash is supposed to provide.
  return (
    event.id ||
    `${event.type}-${event.minute}-${event.playerId ?? ''}-${event.teamId ?? ''}`
  );
}

/** Returns a stable, event-unique non-negative integer. Modulo at call site. */
function templateIndexFor(event: MatchEvent): number {
  return djb2(stableEventKey(event));
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
}

function getTemplate(
  t: TranslationFunction,
  section: string,
  idx: number,
  params?: Record<string, string | number>,
): string {
  // Callers still pass fully-qualified keys (e.g. `commentary.goal`); strip
  // the `commentary.` prefix so a hook scoped via `useTranslations('commentary')`
  // resolves the rest as a relative path. Without this strip, next-intl@4
  // returns the literal dotted key when the lookup path is double-qualified
  // (e.g. `commentary.commentary.goal.tpl_1`), which surfaced in the UI as
  // raw `commentary.full_time.tpl_2` strings.
  const stripped = section.startsWith('commentary.')
    ? section.slice('commentary.'.length)
    : section;
  const key = `${stripped}.tpl_${idx}`;
  // Pass interpolation params to `t()` so next-intl does ICU MessageFormat
  // substitution itself. Without this, next-intl@4 throws FORMATTING_ERROR
  // for templates that declare `{var}` placeholders (e.g. full_time.tpl_0
  // wants `{homeTeam}`, `{winner}`, …) — the error escaped as the literal
  // dotted key in the UI because the formatter's try/catch was missing.
  // The post-call `interpolate()` is intentionally kept for the spec's mock
  // `t()` (which ignores params), so test fixtures still see {var} replaced.
  return params ? t(key, params) : t(key);
}

// Reads `goal.quality_*` strings — two of which ({great}, {good}) contain
// a `{player}` placeholder that must be filled in via `t()`'s params, not
// via the post-call `interpolate()`. Returning a `{player}`-bearing raw
// string would crash the t() call (next-intl@4 throws FORMATTING_ERROR
// when an expected context variable is missing), so we always pass `player`
// even for the {excellent} branch that doesn't use it (no-op there).
function getQualityText(
  t: TranslationFunction,
  shotQuality: number,
  player: string,
): string {
  // Thresholds (60/80) read shotQuality on its native 0-100 scale —
  // the per-shot noise perturbation, NOT the player's finalShootRating
  // (which is 0-300+). The pre-fix code used the same 60/80 gates on
  // a 0-300 value, so virtually every real shot hit `quality_excellent`
  // and the tier system was effectively dead.
  if (shotQuality >= 80) return t('goal.quality_excellent', { player });
  if (shotQuality >= 60) return t('goal.quality_great', { player });
  return t('goal.quality_good', { player });
}

/**
 * Map a 0-100 shotQuality to a tier label. Used by the EventBubble stat
 * line (and any future UI surface that needs a human-readable shot
 * descriptor). Five tiers:
 *
 *   ≥90  top-drawer  — screamer / world-class
 *   ≥75  quality     — clean strike
 *   ≥50  decent      — standard
 *   ≥25  tame        — soft / weak
 *    0+  wayward     — terrible
 *
 * Complements getQualityText (which feeds the narrative `{quality}`
 * slot with a 3-tier gradient — excellent / great / good) by giving
 * UI surfaces a more discriminating label since they're not
 * constrained to a sentence-shaped template.
 */
export function getShotQualityLabel(
  t: TranslationFunction,
  shotQuality: number | null | undefined,
): string {
  if (shotQuality == null) return '';
  if (shotQuality >= 90) return t('shotQuality.tier_top');
  if (shotQuality >= 75) return t('shotQuality.tier_quality');
  if (shotQuality >= 50) return t('shotQuality.tier_decent');
  if (shotQuality >= 25) return t('shotQuality.tier_tame');
  return t('shotQuality.tier_wayward');
}

function getLaneText(t: TranslationFunction, lane: string | undefined): string {
  if (!lane) return '';
  return t(`lane.${lane.toLowerCase()}`);
}

function getShotTypeText(t: TranslationFunction, shotType: string | undefined): string {
  if (!shotType) return '';
  return t(`shotType.${shotType.toLowerCase()}`);
}

function getSeverityText(severity: string | undefined): string {
  if (!severity) return '';
  return ` (${severity})`;
}

function getReasonText(reason: string | undefined): string {
  if (!reason) return '';
  return ` (${reason})`;
}

// ============================================================================
// Narrative-template helpers (push / shot narrative picker)
// ============================================================================
//
// Push / shot / turnover formatters now want a multi-sentence, commentator-
// style rendering that names the players on both sides of the play:
//   - pusher  (attackPush.attackingPlayer) — the player who carried the ball
//   - tackler (attackPush.defendingPlayer) — the defender who stopped it
//   - shooter (shot.shooter)              — the player who took the shot
//   - assist  (shot.assist)               — the player who set it up
//
// The engine populates these fields for every open-play push (see
// simulator match.engine.ts). For LONG_SHOT the defender slot is
// intentionally empty; for turnovers there's no shot. The helpers
// below centralize the null-handling so each formatter stays short.

/** Lane key normalized to the enum the engine uses ('left' | 'center' | 'right').
 *  Falls back to 'center' for legacy rows without a lane. */
function getLaneKey(lane: string | undefined): 'left' | 'center' | 'right' {
  if (lane === 'left' || lane === 'right') return lane;
  return 'center';
}

function getPusherName(data: any): string {
  return (
    data?.sequence?.attackPush?.attackingPlayer ??
    data?.attackingPlayer ??
    data?.playerName ??
    ''
  );
}

function getTacklerName(data: any): string {
  return (
    data?.sequence?.attackPush?.defendingPlayer ??
    data?.defendingPlayer ??
    data?.tacklerName ??
    ''
  );
}

function getShooterName(data: any): string {
  // `data.sequence.shot.shooter` is the structured name; `data.playerName`
  // is the denormalized fallback the processor also writes.
  return data?.sequence?.shot?.shooter ?? data?.playerName ?? '';
}

function getAssistName(data: any): string {
  return data?.sequence?.shot?.assist ?? '';
}

function getShotType(data: any): string {
  return data?.sequence?.shot?.shotType ?? '';
}

function isLongShot(data: any): boolean {
  // `shotType` is the ShotType enum key serialized via
  // `ShotType[shot.shotType]` (see simulator/src/engine/match.engine.ts:2827),
  // so the wire value is the UPPERCASE enum name like `'LONG_SHOT'`.
  // The pre-fix code compared against the i18n display string
  // `'long-range shot'`, which never matches the wire value —
  // the section branch was dead in production.
  return getShotType(data) === 'LONG_SHOT';
}

function isHeader(data: any): boolean {
  return getShotType(data) === 'HEADER';
}

function isOneOnOne(data: any): boolean {
  return getShotType(data) === 'ONE_ON_ONE';
}

function isRebound(data: any): boolean {
  return getShotType(data) === 'REBOUND';
}

function isNormalShot(data: any): boolean {
  return getShotType(data) === 'NORMAL';
}

/**
 * Resolve a shotType discriminator to the narrative sub-section key suffix
 * the i18n file uses. Returns empty string when no shotType is set (caller
 * falls through to lane × assist or the base section).
 */
function getShotTypeSection(data: any): string {
  if (isHeader(data)) return 'header';
  if (isOneOnOne(data)) return 'one_on_one';
  if (isRebound(data)) return 'rebound';
  if (isLongShot(data)) return 'long_shot';
  if (isNormalShot(data)) return 'normal';
  return '';
}

function isPenaltyEvent(event: MatchEvent): boolean {
  // Check the raw type BEFORE the alias collapses PENALTY_GOAL→GOAL,
  // so a shootout `penalty_goal` event still routes to the penalty
  // sub-section. Also check `data.setPieceType` because the in-game
  // penalty path emits `type: 'goal'` with `data.setPieceType: 'penalty'`
  // (see simulator/src/engine/match.engine.ts:3826-3834).
  const rawType = (event.typeName ?? event.type ?? '').toLowerCase();
  if (rawType === 'penalty_goal' || rawType === 'penalty' || rawType === 'penalty_miss') {
    return true;
  }
  const data = event.data as any;
  return data?.setPieceType === 'penalty';
}

function hasAssist(data: any): boolean {
  return Boolean(getAssistName(data));
}

export function formatGoalCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  // Pick the narrative sub-section. Priority order:
  //   1. penalty (distinct event type with its own dramaturgy)
  //   2. shotType (header / one_on_one / rebound / long_shot) —
  //      these redefine the action ("head home", "slot past keeper",
  //      "react to the loose ball", "rip from distance"), so they
  //      take priority over lane/assist
  //   3. lane × assist split for open-play NORMAL shots (the carry →
  //      pass → shot arc fits; differentiate by which wing and whether
  //      an assist was named)
  //
  // Each sub-section carries 4 templates (tpl_0..tpl_3) varying in
  // length from "2-sentence update" to "5-6 sentence commentator
  // build-up". djb2 picks one so per-event variation stays stable.
  let section = 'goal';
  if (isPenaltyEvent(event)) {
    section = 'goal.penalty';
  } else {
    const shotSection = getShotTypeSection(data);
    if (shotSection === 'header' || shotSection === 'one_on_one'
        || shotSection === 'rebound' || shotSection === 'long_shot') {
      // NORMAL falls through to lane × assist (those open-play
      // templates already cover a NORMAL shot well — adding a
      // `goal.normal` section would just duplicate the lane keys).
      section = `goal.${shotSection}`;
    } else if (hasAssist(data)) {
      section = `goal.${getLaneKey(data?.lane)}_with_assist`;
    } else {
      section = `goal.${getLaneKey(data?.lane)}_no_assist`;
    }
  }

  const templateIdx = templateIndexFor(event) % 4;
  const shooter = getShooterName(data) || 'Unknown Player';
  const pusher = getPusherName(data);
  const tackler = getTacklerName(data);
  const assist = getAssistName(data);
  const shotQuality = data?.sequence?.shot?.shotQuality || 0;
  const quality = getQualityText(t, shotQuality, shooter);

  const params: Record<string, string | number> = {
    player: shooter,
    shooter,
    pusher: pusher || shooter,
    tackler: tackler || 'the defender',
    assist: assist || 'a teammate',
    team: teamName,
    quality,
    lane: getLaneText(t, data?.lane),
    shotType: getShotTypeText(t, getShotType(data)),
  };

  // Fall back to the base `goal.tpl_*` set if the chosen sub-section
  // is missing (e.g. older translations that don't have the lane /
  // long_shot / penalty split). next-intl returns the literal key
  // when the path is missing — we detect that and reroute.
  //
  // `getTemplate` strips the `commentary.` prefix before looking
  // up, then appends `.tpl_${idx}` itself — so the returned
  // string when the key is missing is `<section>.tpl_<idx>`
  // (no `commentary.` prefix). Compare against that stripped form.
  const sectionKey = `commentary.${section}`;
  const expectedStripped = `${section}.tpl_${templateIdx}`;
  let template = getTemplate(t, sectionKey, templateIdx, params);
  if (template === expectedStripped) {
    template = getTemplate(t, 'commentary.goal', templateIdx, params);
  }

  // RFC 0003 — Specialty Attribution. If a primary specialty
  // fired on this event, prepend a specialty tag (e.g. "空霸
  // 发威！") to the comment. The tag uses the localized
  // specialty display name from `getSpecialtyLabel` and the
  // player-facing percent bonus from `formatSpecialtyBonus`.
  //
  // We PREPEND rather than REPLACE so the rest of the
  // narrative still reads naturally ("空霸发威！李雷 头球
  // 破门！"). Picked over a separate `goal.specialty.{CODE}`
  // section because:
  //   1. avoids 4 templates × 12 specialties = 48 new i18n
  //      strings to maintain
  //   2. keeps the base section templates as the source of
  //      truth for the action ("header" / "long shot" / ...)
  //   3. lets the player see both the specialty effect AND
  //      the action narrative, instead of one or the other
  const primary = event.specialtyContributions?.find((c) => c.isPrimary);
  if (primary) {
    const specialtyName = getSpecialtyLabel(primary.specialtyCode, 'zh') ?? primary.specialtyCode;
    const bonus = formatSpecialtyBonus(primary.multiplier, 'zh');
    const tag = bonus
      ? `${specialtyName}发威！${bonus} ！`
      : `${specialtyName}发威！`;
    return tag + interpolate(template, params);
  }

  return interpolate(template, params);
}

export function formatShotOnTargetCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  // Shots that the keeper saves split by shotType — a diving save on
  // a header reads differently from a parry on a long-range drive or
  // a smother on a one-on-one. Falls back to the base section if
  // the sub-section is missing.
  const shotSection = getShotTypeSection(data);
  const section = shotSection
    ? `shot_on_target.${shotSection}`
    : 'shot_on_target';

  const templateIdx = templateIndexFor(event) % 4;
  const shooter = getShooterName(data) || 'Unknown Player';
  const pusher = getPusherName(data);
  const tackler = getTacklerName(data);
  const assist = getAssistName(data);
  const shotQuality = data?.sequence?.shot?.shotQuality || 0;
  const quality = shotQuality >= 80
    ? t('goal.quality_chance')
    : shotQuality >= 60
      ? t('goal.quality_opportunity')
      : '';

  const params: Record<string, string | number> = {
    player: shooter,
    shooter,
    pusher: pusher || shooter,
    tackler: tackler || 'the defender',
    assist: assist || 'a teammate',
    team: teamName,
    quality,
    lane: getLaneText(t, data?.lane),
    shotType: getShotTypeText(t, getShotType(data)),
  };

  const sectionKey = `commentary.${section}`;
  const expectedStripped = `${section}.tpl_${templateIdx}`;
  let template = getTemplate(t, sectionKey, templateIdx, params);
  if (template === expectedStripped) {
    template = getTemplate(t, 'commentary.shot_on_target', templateIdx, params);
  }

  return interpolate(template, params);
}

export function formatShotOffTargetCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  // Misses also split by shotType — a headed effort sailing over the
  // bar reads differently from a long-range drive pulled wide.
  // Same fallback rule as the save formatter.
  const shotSection = getShotTypeSection(data);
  const section = shotSection
    ? `shot_off_target.${shotSection}`
    : 'shot_off_target';

  const templateIdx = templateIndexFor(event) % 4;
  const shooter = getShooterName(data) || 'Unknown Player';
  const pusher = getPusherName(data);
  const tackler = getTacklerName(data);
  const assist = getAssistName(data);

  const params: Record<string, string | number> = {
    player: shooter,
    shooter,
    pusher: pusher || shooter,
    tackler: tackler || 'the defender',
    assist: assist || 'a teammate',
    team: teamName,
    lane: getLaneText(t, data?.lane),
    shotType: getShotTypeText(t, getShotType(data)),
  };

  const sectionKey = `commentary.${section}`;
  const expectedStripped = `${section}.tpl_${templateIdx}`;
  let template = getTemplate(t, sectionKey, templateIdx, params);
  if (template === expectedStripped) {
    template = getTemplate(t, 'commentary.shot_off_target', templateIdx, params);
  }

  return interpolate(template, params);
}

export function formatSaveCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const isHome = event.isHome ?? true;
  // Save event is attributed to the GK's team. We expose that team's
  // name to the template so the narrative can name the keeper's
  // side (e.g. "the {team} keeper" instead of just "the keeper").
  const teamName = isHome ? awayTeamName : homeTeamName;

  const templateIdx = templateIndexFor(event) % 4;
  const shooter = getShooterName(data) || 'the attacker';
  const pusher = getPusherName(data) || shooter;
  const assist = getAssistName(data);
  const tackler = getTacklerName(data);

  const params: Record<string, string | number> = {
    shooter,
    pusher,
    assist: assist || 'a teammate',
    tackler: tackler || 'a defender',
    team: teamName,
    lane: getLaneText(t, data?.lane),
    shotType: getShotTypeText(t, getShotType(data)),
  };

  return interpolate(
    getTemplate(t, 'commentary.save', templateIdx, params),
    params,
  );
}

/**
 * Turnover — possession lost on an attacking push that didn't become a shot.
 * The simulator now sets `event.playerId` to the attacking player (shooter
 * if available, else `preSelectedShooter` from simulateKeyMoment). Falls
 * back to the nested `data.sequence.attackPush.attackingPlayer` for older
 * events that predate the engine fix.
 *
 * The tackler (defender credited with the stop) is read from
 * `data.sequence.attackPush.defendingPlayer` and exposed to the
 * template as `{tackler}`. Older rows that predate the change have
 * no such field — in that case we force `tpl_0` (the template
 * variant that doesn't reference `{tackler}`) so the rendered
 * string doesn't have a dangling placeholder.
 *
 * The engine sets `freshPossession = true` after every turnover, so
 * the *very next* `simulateKeyMoment` iteration runs a counter-
 * attack for the side that just won the ball. That counter-attack
 * doesn't get its own event row (it's just the next normal attack
 * sequence), so the user only sees it through the commentary feed
 * if the turnover template *itself* acknowledges the imminent
 * danger. `tpl_3` is the dedicated "counter-attack incoming"
 * variant; the djb2 pick includes it whenever a tackler is known.
 * Older rows without a tackler stay on tpl_0 / tpl_1, which don't
 * mention the counter.
 */
export function formatTurnoverCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  // The defender's team is the one that just won the ball, so it's
  // the "new attacker" — surface it for templates that name the
  // counter side ("{tacklerTeam} launch a quick break").
  const tacklerTeam = isHome ? awayTeamName : homeTeamName;

  const player: string | undefined =
    data?.sequence?.attackPush?.attackingPlayer ??
    data?.attackingPlayer ??
    data?.playerName;

  const tackler: string | undefined =
    data?.sequence?.attackPush?.defendingPlayer ??
    data?.defendingPlayer ??
    data?.tacklerName;

  // For turnover, the pusher and the player are the same person:
  // the attacking player who lost the ball. Templates reference them
  // under both names depending on the variant — tpl_1 says "{player}",
  // tpl_2 / tpl_3 say "{pusher}" — so we pass both, aliased to the
  // same value.
  const pusher = player;

  // When either the tackler or the pusher is missing (legacy rows),
  // force the template variant that doesn't reference them so we don't
  // leak the literal placeholder into the UI. We use `tpl_0` because
  // it's the only variant that references only `{team}`:
  //   tpl_0 → {team}
  //   tpl_1 → {team}, {player}, {tackler}
  //   tpl_2 → {team}, {tacklerTeam}, {pusher}, {tackler}
  //   tpl_3 → {team}, {tacklerTeam}, {pusher}, {tackler}
  const hasTackler = Boolean(tackler);
  const hasPusher = Boolean(pusher);
  const baseIdx = templateIndexFor(event) % 4;
  const templateIdx = hasTackler && hasPusher ? baseIdx : 0;

  return interpolate(
    getTemplate(t, 'commentary.turnover', templateIdx, {
      team: teamName,
      tacklerTeam,
      player: player ?? '',
      tackler: tackler ?? '',
      pusher: pusher ?? '',
    }),
    {
      team: teamName,
      tacklerTeam,
      player: player ?? '',
      tackler: tackler ?? '',
      pusher: pusher ?? '',
    },
  );
}

/**
 * Free kick — emitted as a result of a direct set piece (free kick taken).
 * The simulator puts the kicker's name in `data.playerName` and the fouling
 * team on the event's `isHome` (or `data.setPieceType` for the variant).
 */
export function formatFreeKickCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;
  // The fouling team is the one that *conceded* the kick — it's the
  // opposite of the team taking the set piece. Free-kick tpl can
  // reference `foulingTeam` if it wants a "X was pulled down in
  // the box, Y stands over the ball" feel.
  const foulingTeam = isHome ? awayTeamName : homeTeamName;
  const player: string | undefined = data?.playerName ?? data?.kicker;
  const setPieceType = data?.setPieceType;

  const templateIdx = templateIndexFor(event) % 4;
  return interpolate(
    getTemplate(t, 'commentary.free_kick', templateIdx, {
      team: teamName,
      foulingTeam,
      player: player ?? '',
      setPieceType: setPieceType ?? '',
    }),
    { team: teamName, foulingTeam, player: player ?? '', setPieceType: setPieceType ?? '' },
  );
}

export function formatFoulCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const templateIdx = templateIndexFor(event) % 3;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  // Simulator now sets `event.playerId` on the foul event (the fouling
  // player). The data JSON may also carry a denormalized name; prefer
  // the structured field so future event-bus changes don't break it.
  const player: string | undefined = data?.playerName;

  return interpolate(
    getTemplate(t, 'commentary.foul', templateIdx, { team: teamName, player: player ?? '' }),
    { team: teamName, player: player ?? '' },
  );
}

export function formatOffsideCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const templateIdx = templateIndexFor(event) % 2;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  return interpolate(
    getTemplate(t, 'commentary.offside', templateIdx, { team: teamName }),
    { team: teamName },
  );
}

export function formatCornerCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const templateIdx = templateIndexFor(event) % 4;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;
  const lane = (event.data as any)?.lane as string | undefined;
  const data = event.data as any;
  const tackler = getTacklerName(data);

  return interpolate(
    getTemplate(t, 'commentary.corner', templateIdx, {
      team: teamName,
      lane: getLaneText(t, lane),
      tackler: tackler || 'a defender',
    }),
    { team: teamName, lane: getLaneText(t, lane), tackler: tackler || 'a defender' },
  );
}

export function formatYellowCardCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const templateIdx = templateIndexFor(event) % 2;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const player = data?.playerName || 'Unknown Player';
  const reason = getReasonText(data?.reason);

  return interpolate(
    getTemplate(t, 'commentary.yellow_card', templateIdx, { player, reason, team: teamName }),
    { player, reason, team: teamName },
  );
}

export function formatRedCardCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const templateIdx = templateIndexFor(event) % 2;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const player = data?.playerName || 'Unknown Player';

  return interpolate(
    getTemplate(t, 'commentary.red_card', templateIdx, { player, team: teamName }),
    { player, team: teamName },
  );
}

export function formatSubstitutionCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const templateIdx = templateIndexFor(event) % 3;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const playerIn = data?.substitutePlayerName || data?.player?.name || 'Player';

  return interpolate(
    getTemplate(t, 'commentary.substitution', templateIdx, { playerIn, team: teamName }),
    { playerIn, team: teamName },
  );
}

export function formatInjuryCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const templateIdx = templateIndexFor(event) % 3;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const player = data?.playerName || 'Unknown Player';
  const severity = getSeverityText(data?.severity);

  return interpolate(
    getTemplate(t, 'commentary.injury', templateIdx, { player, severity, team: teamName }),
    { player, severity, team: teamName },
  );
}

export function formatClearanceCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const templateIdx = templateIndexFor(event) % 2;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  return interpolate(
    getTemplate(t, 'commentary.clearance', templateIdx, { team: teamName }),
    { team: teamName },
  );
}

export function formatInterceptionCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const templateIdx = templateIndexFor(event) % 2;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  return interpolate(
    getTemplate(t, 'commentary.interception', templateIdx, { team: teamName }),
    { team: teamName },
  );
}

export function formatPenaltyCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const templateIdx = templateIndexFor(event) % 4;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;
  const data = event.data as any;
  // Set-piece conversion: a foul in the box by a defender produced
  // the kick. Surface the defender's name + team so the template
  // can write "X brought down Y in the area — penalty".
  const foulingTeam = isHome ? awayTeamName : homeTeamName;
  const fouler = data?.foulerName ?? data?.fouledPlayerName ?? '';

  return interpolate(
    getTemplate(t, 'commentary.penalty', templateIdx, {
      team: teamName,
      foulingTeam,
      fouler,
    }),
    { team: teamName, foulingTeam, fouler },
  );
}

export function formatPenaltyMissCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;
  const templateIdx = templateIndexFor(event) % 4;
  const player = data?.playerName || 'Unknown Player';
  const tackler = getTacklerName(data);

  return interpolate(
    getTemplate(t, 'commentary.penalty_miss', templateIdx, {
      team: teamName,
      player,
      tackler: tackler || 'the keeper',
    }),
    { team: teamName, player, tackler: tackler || 'the keeper' },
  );
}

export function formatWeatherAnnouncementCommentary(
  event: MatchEvent,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const weather = data?.weather || data?.weatherKey || 'sunny';

  // Strip `commentary.` prefix when callers (see getTemplate) are scoped to
  // the `commentary` namespace via `useTranslations('commentary')`.
  return t(`weather.${weather.toLowerCase()}`);
}

/**
 * Format the dedicated attendance-announcement event (post-RFC split).
 *
 * Pre-split, attendance piggybacked on `weather_announcement.data` and
 * the formatter rendered "weather + crowd" on a single trailing line.
 * After the split, attendance is its own event so weather stays
 * independent and the crowd line can carry extra context (e.g. fill
 * rate) without bloating the weather event.
 *
 * Zero / missing attendance is treated as "no crowd context" and the
 * formatter emits an empty string — the FE already gates visibility
 * on the number being present, so emitting empty here keeps the
 * pre-match preview card clean for legacy rows that never had
 * `match.attendance` populated.
 */
export function formatAttendanceAnnouncementCommentary(
  event: MatchEvent,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const attendance = typeof data?.attendance === 'number' ? data.attendance : null;
  if (!attendance || attendance <= 0) {
    return '';
  }
  // Pass the placeholder value to `t` directly rather than running
  // it through our custom `interpolate`. next-intl 3+ validates the
  // params at call time — if a translation key contains `{count}` and
  // we don't pass `count`, it logs a FORMATTING_ERROR in dev (and
  // drops the placeholder in prod), which is exactly what was
  // happening here. The other formatters in this file already follow
  // this `t(key, params)` pattern; this one had a custom interpolate
  // that bypassed the check.
  return t('attendance.line', { count: formatNumber(attendance) });
}

function formatNumber(n: number): string {
  // Locale-agnostic grouping (the formatter is rendered in en/zh based
  // on the caller's `useTranslations` locale). Avoid Intl.* here to
  // keep tests deterministic.
  return n.toLocaleString('en-US');
}

export function formatPlayerIntroductionCommentary(
  event: MatchEvent,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const homePlayers = data?.homePlayers?.length || 0;
  const awayPlayers = data?.awayPlayers?.length || 0;

  return interpolate(
    getTemplate(t, 'commentary.player_introduction', 0, { homePlayers, awayPlayers }),
    { homePlayers, awayPlayers },
  );
}

// ---------------------------------------------------------------------------
// Score-aware template picker for period events (half-time, second-half
// kickoff, full-time). The legacy formatter used a hash-based index
// (`templateIndexFor(event) % 3`) which gave stable but random variation —
// `0-3` and `1-0` at the break read the same generic "Half-time! 0-3, players
// to the dressing room" line, with no sense of whether the home side is in
// trouble or cruising. The buckets below split the score space into a small
// number of narratively distinct cases so the FE can read
//   - tied / level       — "all to play for"
//   - one side ahead     — "in control" / "work to do"
//   - blowout (|diff|≥3)  — "a mountain to climb" / "dominant display"
// and pick the matching template.
//
// Why 3 buckets for HT/2HS and 5 for FT: half-time and second-half kickoff
// only need a coarse "tied / leader / trailer" split — the score is in
// motion, no need to dramatize yet. Full-time is the headline event; we
// split close wins/losses from blowouts so the FE can congratulate more
// emphatically when the margin is decisive, and commiserate more when it's
// a heavy defeat.
// ---------------------------------------------------------------------------
function halfTimeSituation(
  homeScore: number,
  awayScore: number,
): 'tied' | 'home_lead' | 'away_lead' {
  if (homeScore > awayScore) return 'home_lead';
  if (homeScore < awayScore) return 'away_lead';
  return 'tied';
}

// Maps the half-time buckets to a tpl_N index in
// `commentary.half_time` (and the same shape for
// `commentary.second_half_start`). 0=tied, 1=home_lead, 2=away_lead.
const HALF_TIME_TEMPLATE_INDEX: Record<
  ReturnType<typeof halfTimeSituation>,
  number
> = {
  tied: 0,
  home_lead: 1,
  away_lead: 2,
};

function fullTimeSituation(
  homeScore: number,
  awayScore: number,
):
  | 'tied'
  | 'home_close'
  | 'home_blowout'
  | 'away_close'
  | 'away_blowout' {
  if (homeScore === awayScore) return 'tied';
  const diff = Math.abs(homeScore - awayScore);
  const blowout = diff >= 3;
  if (homeScore > awayScore) return blowout ? 'home_blowout' : 'home_close';
  return blowout ? 'away_blowout' : 'away_close';
}

// Maps the 5 full-time buckets to tpl_N. 0..3 are the four win
// variants (home_close, home_blowout, away_close, away_blowout);
// 4 is the draw. The order is stable so the FE test can pin a
// specific bucket by walking the (homeScore, awayScore) matrix.
const FULL_TIME_TEMPLATE_INDEX: Record<
  ReturnType<typeof fullTimeSituation>,
  number
> = {
  home_close: 0,
  home_blowout: 1,
  away_close: 2,
  away_blowout: 3,
  tied: 4,
};

export function formatPeriodCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const type = canonicalEventType(event.typeName ?? event.type);
  const data = event.data as any;

  let section = 'commentary.half_time';
  if (type === 'FULL_TIME') section = 'commentary.full_time';
  else if (type === 'KICKOFF') section = 'commentary.kickoff';
  else if (type === 'SECOND_HALF_START') section = 'commentary.second_half_start';
  else if (type === 'EXTRA_TIME_START') section = 'commentary.extra_time_start';
  else if (type === 'PENALTY_START') section = 'commentary.penalty_start';

  // Half-time whistle: pick a template based on the running score
  // situation. We always interpolate the score regardless of which
  // template the FE picks, so every variant can include the
  // scoreline in its own wording.
  if (type === 'HALF_TIME') {
    const homeScore = data?.homeScore ?? 0;
    const awayScore = data?.awayScore ?? 0;
    const idx =
      HALF_TIME_TEMPLATE_INDEX[
        halfTimeSituation(homeScore, awayScore)
      ];
    return interpolate(
      getTemplate(t, section, idx, {
        homeTeam: homeTeamName,
        awayTeam: awayTeamName,
        homeScore,
        awayScore,
      }),
      { homeTeam: homeTeamName, awayTeam: awayTeamName, homeScore, awayScore },
    );
  }

  // Second-half kickoff: same 3-bucket situation picker as half-time
  // (using the 1H score that's already on the event data). The
  // template is more forward-looking — "next 45" / "comeback
  // needed" — but the score math is identical.
  if (type === 'SECOND_HALF_START') {
    const homeScore = data?.homeScore ?? 0;
    const awayScore = data?.awayScore ?? 0;
    const idx =
      HALF_TIME_TEMPLATE_INDEX[
        halfTimeSituation(homeScore, awayScore)
      ];
    return interpolate(
      getTemplate(t, section, idx, {
        homeTeam: homeTeamName,
        awayTeam: awayTeamName,
        homeScore,
        awayScore,
      }),
      { homeTeam: homeTeamName, awayTeam: awayTeamName, homeScore, awayScore },
    );
  }

  // Full-time: 5-bucket picker keyed on the final score. The
  // legacy code passed `winner` as an interpolation variable
  // because the old templates said "{winner} claims all three
  // points" — with score-aware templates the winner is implicit
  // (each bucket's template is already winner-specific), so we
  // drop the variable. The i18n keys still accept {homeTeam},
  // {awayTeam}, {homeScore}, {awayScore} as before.
  if (type === 'FULL_TIME') {
    const homeScore = data?.homeScore ?? 0;
    const awayScore = data?.awayScore ?? 0;
    const idx =
      FULL_TIME_TEMPLATE_INDEX[
        fullTimeSituation(homeScore, awayScore)
      ];

    const params = {
      homeTeam: homeTeamName,
      awayTeam: awayTeamName,
      homeScore,
      awayScore,
    };
    return interpolate(getTemplate(t, section, idx, params), params);
  }

  // Simple period events without score (KICKOFF at minute 0,
  // EXTRA_TIME_START, PENALTY_START). The 2H kickoff is handled
  // above under SECOND_HALF_START; this branch is for the ones
  // that have no score yet (or no score dependence).
  return getTemplate(t, section, 0);
}

export function formatForfeitCommentary(
  event: MatchEvent,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const forfeitingTeam = data?.forfeitingTeam ?? '';
  const winner = data?.winner ?? '';
  const tplIdx = templateIndexFor(event) % 2;

  return interpolate(
    getTemplate(t, 'commentary.forfeit', tplIdx, { forfeitingTeam, winner }),
    { forfeitingTeam, winner },
  );
}

export function formatEventCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  // Canonicalize via EVENT_TYPE_ALIAS so simulator strings like `goal`,
  // `miss`, `save`, `second_half`, `penalty_goal` resolve to the formatter's
  // switch keys. Without the alias, ~half the event stream fell through to
  // the default branch.
  const type = canonicalEventType(event.typeName ?? event.type);

  switch (type) {
    case 'GOAL':
      return formatGoalCommentary(event, homeTeamName, awayTeamName, t);
    case 'SHOT_ON_TARGET':
    case 'SAVE':
      return formatShotOnTargetCommentary(event, homeTeamName, awayTeamName, t);
    case 'SHOT_OFF_TARGET':
    case 'MISS':
      return formatShotOffTargetCommentary(event, homeTeamName, awayTeamName, t);
    case 'FOUL':
      return formatFoulCommentary(event, homeTeamName, awayTeamName, t);
    case 'TURNOVER':
      return formatTurnoverCommentary(event, homeTeamName, awayTeamName, t);
    case 'FREE_KICK':
      return formatFreeKickCommentary(event, homeTeamName, awayTeamName, t);
    case 'OFFSIDE':
      return formatOffsideCommentary(event, homeTeamName, awayTeamName, t);
    case 'CORNER':
      return formatCornerCommentary(event, homeTeamName, awayTeamName, t);
    case 'YELLOW_CARD':
      return formatYellowCardCommentary(event, homeTeamName, awayTeamName, t);
    case 'RED_CARD':
    case 'SECOND_YELLOW':
      return formatRedCardCommentary(event, homeTeamName, awayTeamName, t);
    case 'SUBSTITUTION':
      return formatSubstitutionCommentary(event, homeTeamName, awayTeamName, t);
    case 'INJURY':
      return formatInjuryCommentary(event, homeTeamName, awayTeamName, t);
    case 'CLEARANCE':
      return formatClearanceCommentary(event, homeTeamName, awayTeamName, t);
    case 'INTERCEPTION':
      return formatInterceptionCommentary(event, homeTeamName, awayTeamName, t);
    case 'PENALTY':
      return formatPenaltyCommentary(event, homeTeamName, awayTeamName, t);
    case 'PENALTY_MISS':
      return formatPenaltyMissCommentary(event, homeTeamName, awayTeamName, t);
    case 'WEATHER_ANNOUNCEMENT':
      return formatWeatherAnnouncementCommentary(event, t);
    case 'ATTENDANCE_ANNOUNCEMENT':
      return formatAttendanceAnnouncementCommentary(event, t);
    case 'PLAYER_INTRODUCTION':
      return formatPlayerIntroductionCommentary(event, t);
    case 'HALF_TIME':
    case 'FULL_TIME':
    case 'KICKOFF':
    case 'SECOND_HALF_START':
    case 'EXTRA_TIME_START':
    case 'PENALTY_START':
      return formatPeriodCommentary(event, homeTeamName, awayTeamName, t);
    case 'FORFEIT':
      return formatForfeitCommentary(event, t);
    case 'SNAPSHOT':
      return '';
    default:
      return `${type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} at ${event.minute}'`;
  }
}
