import { MatchStatus, MatchType, WeatherType } from '@goalxi/database';

export class MatchResDto {
  id!: string;
  leagueId!: string;
  season!: number;
  week!: number;
  round?: number;
  homeTeamId!: string;
  awayTeamId!: string;
  homeScore!: number | null;
  awayScore!: number | null;
  status!: MatchStatus;
  type!: MatchType;
  scheduledAt!: Date;
  simulationCompletedAt!: Date | null;
  homeTeam!: {
    id: string;
    name: string;
    logo: string | null;
  };
  awayTeam!: {
    id: string;
    name: string;
    logo: string | null;
  };

  // Phase 4: Match automation fields
  tacticsLocked!: boolean;
  homeForfeit!: boolean;
  awayForfeit!: boolean;
  firstHalfInjuryTime!: number | null;
  secondHalfInjuryTime!: number | null;
  hasExtraTime!: boolean;

  // Computed fields
  homeTacticsSet?: boolean;
  awayTacticsSet?: boolean;

  // Match-day context. Populated by the scheduler at tactics-lock time
  // (`match.weather`) and by the simulator at completion
  // (`match.attendance`); denormalised onto the entity so the frontend
  // never has to dig through `weather_announcement` events to render the
  // right-column info card.
  weather?: WeatherType | null;
  attendance?: number | null;
  /**
   * Stadium display name. Resolved from `match.stadium.name` when the
   * relation is loaded (single match fetch); `null` for list responses
   * that don't join the stadium row.
   */
  venue?: string | null;
}

