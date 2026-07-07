import type { MatchEvent } from './api';

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

function getQualityText(t: TranslationFunction, shootRating: number): string {
  // Relative keys — the hook is expected to be scoped via
  // `useTranslations('commentary')` so `commentary.` is implicit.
  if (shootRating >= 80) return t('goal.quality_excellent');
  if (shootRating >= 60) return t('goal.quality_great');
  return t('goal.quality_good');
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

export function formatGoalCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const templateIdx = templateIndexFor(event) % 4;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const player = data?.sequence?.shot?.shooter || data?.playerName || 'Unknown Player';
  const lane = data?.lane;
  const shotType = data?.sequence?.shot?.shotType;
  const shootRating = data?.sequence?.shot?.shootRating || 0;

  const quality = getQualityText(t, shootRating);
  const laneDesc = getLaneText(t, lane);
  const shotTypeDesc = getShotTypeText(t, shotType);

  const params: Record<string, string | number> = {
    player,
    team: teamName,
    quality,
    lane: laneDesc,
    shotType: shotTypeDesc,
  };

  const template = getTemplate(t, 'commentary.goal', templateIdx, params);

  return interpolate(template, params);
}

export function formatShotOnTargetCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const templateIdx = templateIndexFor(event) % 4;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const player = data?.sequence?.shot?.shooter || data?.playerName || 'Unknown Player';
  const lane = data?.lane;
  const shotType = data?.sequence?.shot?.shotType;
  const shootRating = data?.sequence?.shot?.shootRating || 0;

  const quality = shootRating >= 80 ? t('goal.quality_chance')
               : shootRating >= 60 ? t('goal.quality_opportunity')
               : '';
  const laneDesc = lane ? `${getLaneText(t, lane)} ` : '';
  const shotTypeDesc = shotType ? ` (${getShotTypeText(t, shotType)})` : '';

  const params: Record<string, string | number> = {
    player,
    team: teamName,
    quality,
    lane: laneDesc,
    shotType: shotTypeDesc,
  };

  const template = getTemplate(t, 'commentary.shot_on_target', templateIdx, params);

  return interpolate(template, params);
}

export function formatShotOffTargetCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const templateIdx = templateIndexFor(event) % 3;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const player = data?.sequence?.shot?.shooter || data?.playerName || 'Unknown Player';
  const lane = data?.lane;
  const laneDesc = lane ? `${getLaneText(t, lane)} ` : '';

  const params: Record<string, string | number> = {
    player,
    team: teamName,
    lane: laneDesc,
  };

  const template = getTemplate(t, 'commentary.shot_off_target', templateIdx, params);

  return interpolate(template, params);
}

export function formatSaveCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const templateIdx = templateIndexFor(event) % 3;
  return getTemplate(t, 'commentary.save', templateIdx);
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

  return interpolate(
    getTemplate(t, 'commentary.foul', templateIdx, { team: teamName }),
    { team: teamName },
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
  const templateIdx = templateIndexFor(event) % 2;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  return interpolate(
    getTemplate(t, 'commentary.corner', templateIdx, { team: teamName }),
    { team: teamName },
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
  const templateIdx = templateIndexFor(event) % 2;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  return interpolate(
    getTemplate(t, 'commentary.penalty', templateIdx, { team: teamName }),
    { team: teamName },
  );
}

export function formatPenaltyMissCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const templateIdx = templateIndexFor(event) % 2;
  const player = data?.playerName || 'Unknown Player';

  return interpolate(
    getTemplate(t, 'commentary.penalty_miss', templateIdx, { player }),
    { player },
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
  const baseLine = t(`weather.${weather.toLowerCase()}`);

  // Attendance piggybacks on the weather event — there is no separate
  // crowd-announcement event type. The simulator's forfeit path also
  // emits this field; normal matches populate it via the pre-sim
  // scheduler. Render as a single trailing line so both messages read
  // as "match preview" context.
  const attendance = typeof data?.attendance === 'number' ? data.attendance : null;
  if (attendance && attendance > 0) {
    const crowdTemplate = t('attendance.line');
    const crowdLine = interpolate(crowdTemplate, { count: formatNumber(attendance) });
    return `${baseLine} ${crowdLine}`;
  }
  return baseLine;
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

  // Handle half_time with score
  if (type === 'HALF_TIME') {
    const homeScore = data?.homeScore ?? 0;
    const awayScore = data?.awayScore ?? 0;
    return interpolate(
      getTemplate(t, section, 0, {
        homeTeam: homeTeamName,
        awayTeam: awayTeamName,
        homeScore,
        awayScore,
      }),
      { homeTeam: homeTeamName, awayTeam: awayTeamName, homeScore, awayScore },
    );
  }

  // Handle full_time with score and winner
  if (type === 'FULL_TIME') {
    const homeScore = data?.homeScore ?? 0;
    const awayScore = data?.awayScore ?? 0;
    const templateIdx = templateIndexFor(event) % 3;

    let winner: string;
    if (homeScore > awayScore) {
      winner = homeTeamName;
    } else if (awayScore > homeScore) {
      winner = awayTeamName;
    } else {
      winner = t('full_time.draw');
    }

    const params = {
      homeTeam: homeTeamName,
      awayTeam: awayTeamName,
      homeScore,
      awayScore,
      winner,
    };
    return interpolate(getTemplate(t, section, templateIdx, params), params);
  }

  // Simple period events without score
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
