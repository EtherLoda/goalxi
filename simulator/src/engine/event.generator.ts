import { MatchState } from './match-state';
import { MatchEventType, Zone } from './types';
import { MatchTacticsEntity } from '@goalxi/database';

// NOTE: `descriptionIndex` previously attached a random per-event index here
// for picking among `commentary.*.tpl_N` templates. The field never crossed
// any boundary (no entity column, gateway drops it, WS drops it, formatter
// uses its own djb2 hash for stable variation). Generating it here just
// produced noise that contradicted the front-end's chosen variation.

export class EventGenerator {
  constructor() {}

  generateEvent(
    state: MatchState,
    homeTactics: MatchTacticsEntity,
    awayTactics: MatchTacticsEntity,
  ): any | null {
    // 1. Determine active team (possession)
    const possessionTeamId = state.possessionTeamId;
    if (!possessionTeamId) {
      return null;
    }

    const isHomePossession = possessionTeamId === (state as any).homeTeamId;
    const attackingTeamTactics = isHomePossession ? homeTactics : awayTactics;
    const defendingTeamTactics = isHomePossession ? awayTactics : homeTactics;

    const roll = Math.random();

    if (state.ballZone === 'Attack') {
      if (roll < 0.05) {
        return {
          type: MatchEventType.GOAL,
          teamId: possessionTeamId,
          minute: state.currentTime,
          second: state.currentSecond,
        };
      } else if (roll < 0.14) {
        return {
          type: MatchEventType.SHOT_OFF_TARGET,
          teamId: possessionTeamId,
          minute: state.currentTime,
          second: state.currentSecond,
        };
      } else if (roll < 0.23) {
        return {
          type: MatchEventType.SHOT_ON_TARGET,
          teamId: possessionTeamId,
          minute: state.currentTime,
          second: state.currentSecond,
        };
      } else if (roll < 0.28) {
        return {
          type: MatchEventType.SAVE,
          teamId: isHomePossession ? state.awayTeamId : state.homeTeamId,
          minute: state.currentTime,
          second: state.currentSecond,
        };
      } else if (roll < 0.32) {
        return {
          type: MatchEventType.OFFSIDE,
          teamId: possessionTeamId,
          minute: state.currentTime,
          second: state.currentSecond,
        };
      } else if (roll < 0.34) {
        return {
          type: MatchEventType.CELEBRATION,
          teamId: possessionTeamId,
          minute: state.currentTime,
          second: state.currentSecond,
        };
      }
    } else if (state.ballZone === 'Midfield') {
      if (roll < 0.2) {
        state.setBallZone('Attack');
        return {
          type: MatchEventType.PASS,
          teamId: possessionTeamId,
          minute: state.currentTime,
          second: state.currentSecond,
        };
      } else if (roll > 0.8) {
        state.setPossession(
          isHomePossession
            ? (state as any).awayTeamId
            : (state as any).homeTeamId,
        );
        return {
          type: MatchEventType.INTERCEPTION,
          teamId: isHomePossession
            ? (state as any).awayTeamId
            : (state as any).homeTeamId,
          minute: state.currentTime,
          second: state.currentSecond,
        };
      } else if (roll > 0.6 && roll < 0.7) {
        return {
          type: MatchEventType.TACKLE,
          teamId: isHomePossession
            ? (state as any).awayTeamId
            : (state as any).homeTeamId,
          minute: state.currentTime,
          second: state.currentSecond,
        };
      } else if (roll > 0.9) {
        return {
          type: MatchEventType.FOUL,
          teamId: isHomePossession
            ? (state as any).awayTeamId
            : (state as any).homeTeamId,
          minute: state.currentTime,
          second: state.currentSecond,
        };
      } else if (roll > 0.95) {
        return {
          type: MatchEventType.NEUTRAL_EVENT,
          teamId: isHomePossession
            ? (state as any).awayTeamId
            : (state as any).homeTeamId,
          minute: state.currentTime,
          second: state.currentSecond,
        };
      }
    } else if (state.ballZone === 'Defense') {
      if (roll < 0.1) {
        state.setBallZone('Midfield');
        return {
          type: MatchEventType.PASS,
          teamId: possessionTeamId,
          minute: state.currentTime,
          second: state.currentSecond,
        };
      } else if (roll > 0.7) {
        state.setPossession(
          isHomePossession
            ? (state as any).awayTeamId
            : (state as any).homeTeamId,
        );
        return {
          type: MatchEventType.INTERCEPTION,
          teamId: isHomePossession
            ? (state as any).awayTeamId
            : (state as any).homeTeamId,
          minute: state.currentTime,
          second: state.currentSecond,
        };
      } else if (roll > 0.85) {
        return {
          type: MatchEventType.CLEARANCE,
          teamId: possessionTeamId,
          minute: state.currentTime,
          second: state.currentSecond,
        };
      } else if (roll > 0.92) {
        return {
          type: MatchEventType.FOUL,
          teamId: isHomePossession
            ? (state as any).awayTeamId
            : (state as any).homeTeamId,
          minute: state.currentTime,
          second: state.currentSecond,
        };
      }
    }

    return null;
  }
}

/**
 * Generate kickoff/period start events
 */
export function generatePeriodStartEvent(
  type: MatchEventType,
  minute: number,
  homeTeamName: string,
  awayTeamName: string,
  period: 'first_half' | 'second_half' | 'extra_time' | 'penalty',
): any {
  return {
    type,
    minute,
    second: 0,
    data: {
      homeTeam: homeTeamName,
      awayTeam: awayTeamName,
      period,
    },
  };
}

/**
 * Generate lineup announcement event
 */
export function generateLineupEvent(
  minute: number,
  teamName: string,
  players: Array<{ name: string; position: string; shirtNumber: number }>,
): any {
  return {
    type: MatchEventType.MATCH_START,
    minute,
    second: 0,
    teamName,
    data: {
      players,
      teamName,
    },
  };
}

/**
 * Generate weather announcement event
 */
export function generateWeatherAnnouncementEvent(
  minute: number,
  weather: string,
  homeTeam: string,
  awayTeam: string,
): any {
  // Format weather for display
  const weatherDisplay = weather
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return {
    type: MatchEventType.WEATHER_ANNOUNCEMENT,
    minute,
    second: 0,
    teamId: undefined, // Neutral event
    data: {
      weather: weatherDisplay,
      weatherKey: weather,
      homeTeam,
      awayTeam,
    },
  };
}

/**
 * Generate player introduction event (both teams lineup)
 */
export function generatePlayerIntroductionEvent(
  minute: number,
  homeTeam: string,
  awayTeam: string,
  homePlayers: Array<{ name: string; position: string }>,
  awayPlayers: Array<{ name: string; position: string }>,
): any {
  return {
    type: MatchEventType.PLAYER_INTRODUCTION,
    minute,
    second: 0,
    teamId: undefined, // Neutral event
    data: {
      homeTeam,
      awayTeam,
      homePlayers,
      awayPlayers,
    },
  };
}

/**
 * Generate forfeit event
 */
export function generateForfeitEvent(
  minute: number,
  forfeitingTeamName: string,
  winnerName: string,
): any {
  return {
    type: MatchEventType.FORFEIT,
    minute,
    second: 0,
    teamId: undefined, // Neutral event
    data: {
      forfeitingTeam: forfeitingTeamName,
      winner: winnerName,
    },
  };
}
