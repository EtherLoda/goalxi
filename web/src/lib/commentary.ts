import type { MatchEvent } from './api';

type TranslationFunction = (key: string, params?: Record<string, string | number>) => string;

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
}

function getTemplate(t: TranslationFunction, section: string, idx: number): string {
  const key = `${section}.tpl_${idx}`;
  return t(key);
}

function getQualityText(t: TranslationFunction, shootRating: number): string {
  if (shootRating >= 80) return t('commentary.goal.quality_excellent');
  if (shootRating >= 60) return t('commentary.goal.quality_great');
  return t('commentary.goal.quality_good');
}

function getLaneText(t: TranslationFunction, lane: string | undefined): string {
  if (!lane) return '';
  return t(`commentary.lane.${lane.toLowerCase()}`);
}

function getShotTypeText(t: TranslationFunction, shotType: string | undefined): string {
  if (!shotType) return '';
  return t(`commentary.shotType.${shotType.toLowerCase()}`);
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
  const templateIdx = ((event as any).descriptionIndex ?? 1) % 4;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const player = data?.sequence?.shot?.shooter || data?.playerName || 'Unknown Player';
  const lane = data?.lane;
  const shotType = data?.sequence?.shot?.shotType;
  const shootRating = data?.sequence?.shot?.shootRating || 0;

  const quality = getQualityText(t, shootRating);
  const laneDesc = getLaneText(t, lane);
  const shotTypeDesc = getShotTypeText(t, shotType);

  const template = getTemplate(t, 'commentary.goal', templateIdx);

  const params: Record<string, string | number> = {
    player,
    team: teamName,
    quality,
    lane: laneDesc,
    shotType: shotTypeDesc,
  };

  return interpolate(template, params);
}

export function formatShotOnTargetCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const templateIdx = ((event as any).descriptionIndex ?? 1) % 4;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const player = data?.sequence?.shot?.shooter || data?.playerName || 'Unknown Player';
  const lane = data?.lane;
  const shotType = data?.sequence?.shot?.shotType;
  const shootRating = data?.sequence?.shot?.shootRating || 0;

  const quality = shootRating >= 80 ? t('commentary.goal.quality_chance')
               : shootRating >= 60 ? t('commentary.goal.quality_opportunity')
               : '';
  const laneDesc = lane ? `${getLaneText(t, lane)} ` : '';
  const shotTypeDesc = shotType ? ` (${getShotTypeText(t, shotType)})` : '';

  const template = getTemplate(t, 'commentary.shot_on_target', templateIdx);

  const params: Record<string, string | number> = {
    player,
    team: teamName,
    quality,
    lane: laneDesc,
    shotType: shotTypeDesc,
  };

  return interpolate(template, params);
}

export function formatShotOffTargetCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const templateIdx = ((event as any).descriptionIndex ?? 1) % 3;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const player = data?.sequence?.shot?.shooter || data?.playerName || 'Unknown Player';
  const lane = data?.lane;
  const laneDesc = lane ? `${getLaneText(t, lane)} ` : '';

  const template = getTemplate(t, 'commentary.shot_off_target', templateIdx);

  const params: Record<string, string | number> = {
    player,
    team: teamName,
    lane: laneDesc,
  };

  return interpolate(template, params);
}

export function formatSaveCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const templateIdx = ((event as any).descriptionIndex ?? 1) % 3;
  const template = getTemplate(t, 'commentary.save', templateIdx);
  return template;
}

export function formatFoulCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const templateIdx = ((event as any).descriptionIndex ?? 1) % 3;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const template = getTemplate(t, 'commentary.foul', templateIdx);

  return interpolate(template, { team: teamName });
}

export function formatOffsideCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const templateIdx = ((event as any).descriptionIndex ?? 1) % 2;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const template = getTemplate(t, 'commentary.offside', templateIdx);

  return interpolate(template, { team: teamName });
}

export function formatCornerCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const templateIdx = ((event as any).descriptionIndex ?? 1) % 2;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const template = getTemplate(t, 'commentary.corner', templateIdx);

  return interpolate(template, { team: teamName });
}

export function formatYellowCardCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const templateIdx = ((event as any).descriptionIndex ?? 1) % 2;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const player = data?.playerName || 'Unknown Player';
  const reason = getReasonText(data?.reason);

  const template = getTemplate(t, 'commentary.yellow_card', templateIdx);

  return interpolate(template, { player, reason });
}

export function formatRedCardCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const templateIdx = ((event as any).descriptionIndex ?? 1) % 2;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const player = data?.playerName || 'Unknown Player';

  const template = getTemplate(t, 'commentary.red_card', templateIdx);

  return interpolate(template, { player, team: teamName });
}

export function formatSubstitutionCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const templateIdx = ((event as any).descriptionIndex ?? 1) % 3;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const playerIn = data?.substitutePlayerName || data?.player?.name || 'Player';

  const template = getTemplate(t, 'commentary.substitution', templateIdx);

  return interpolate(template, { playerIn, team: teamName });
}

export function formatInjuryCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const templateIdx = ((event as any).descriptionIndex ?? 1) % 3;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const player = data?.playerName || 'Unknown Player';
  const severity = getSeverityText(data?.severity);

  const template = getTemplate(t, 'commentary.injury', templateIdx);

  return interpolate(template, { player, severity, team: teamName });
}

export function formatClearanceCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const templateIdx = ((event as any).descriptionIndex ?? 1) % 2;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const template = getTemplate(t, 'commentary.clearance', templateIdx);

  return interpolate(template, { team: teamName });
}

export function formatInterceptionCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const templateIdx = ((event as any).descriptionIndex ?? 1) % 2;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const template = getTemplate(t, 'commentary.interception', templateIdx);

  return interpolate(template, { team: teamName });
}

export function formatPenaltyCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const templateIdx = ((event as any).descriptionIndex ?? 1) % 2;
  const isHome = event.isHome ?? true;
  const teamName = isHome ? homeTeamName : awayTeamName;

  const template = getTemplate(t, 'commentary.penalty', templateIdx);

  return interpolate(template, { team: teamName });
}

export function formatPenaltyMissCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const templateIdx = ((event as any).descriptionIndex ?? 1) % 2;
  const player = data?.playerName || 'Unknown Player';

  const template = getTemplate(t, 'commentary.penalty_miss', templateIdx);

  return interpolate(template, { player });
}

export function formatWeatherAnnouncementCommentary(
  event: MatchEvent,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const weather = data?.weather || data?.weatherKey || 'Unknown';

  const template = getTemplate(t, 'commentary.weather_announcement', 0);

  return interpolate(template, { weather });
}

export function formatPlayerIntroductionCommentary(
  event: MatchEvent,
  t: TranslationFunction,
): string {
  const data = event.data as any;
  const homePlayers = data?.homePlayers?.length || 0;
  const awayPlayers = data?.awayPlayers?.length || 0;

  const template = getTemplate(t, 'commentary.player_introduction', 0);

  return interpolate(template, { homePlayers, awayPlayers });
}

export function formatPeriodCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const type = (event.typeName || event.type || '').toUpperCase();
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
    const template = getTemplate(t, section, 0);
    return interpolate(template, { homeTeam: homeTeamName, awayTeam: awayTeamName, homeScore, awayScore });
  }

  // Handle full_time with score and winner
  if (type === 'FULL_TIME') {
    const homeScore = data?.homeScore ?? 0;
    const awayScore = data?.awayScore ?? 0;
    const templateIdx = ((event as any).descriptionIndex ?? 1) % 3;
    const template = getTemplate(t, section, templateIdx);

    let winner: string;
    if (homeScore > awayScore) {
      winner = homeTeamName;
    } else if (awayScore > homeScore) {
      winner = awayTeamName;
    } else {
      winner = t('commentary.full_time.draw');
    }

    return interpolate(template, {
      homeTeam: homeTeamName,
      awayTeam: awayTeamName,
      homeScore,
      awayScore,
      winner,
    });
  }

  // Simple period events without score
  const template = getTemplate(t, section, 0);
  return template;
}

export function formatEventCommentary(
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  t: TranslationFunction,
): string {
  const type = (event.typeName || event.type || '').toUpperCase();

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
    case 'SNAPSHOT':
      return '';
    default:
      return `${type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} at ${event.minute}'`;
  }
}
