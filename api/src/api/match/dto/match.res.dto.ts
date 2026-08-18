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
  // (`match.weather`) and by the pre-sim scheduler
  // (`match.attendance`); the simulator then emits them as separate
  // `weather_announcement` and `attendance_announcement` events at
  // minute 0. Both columns are denormalised onto the entity so the
  // FE never has to dig through events to render the right-column
  // info card.
  weather?: WeatherType | null;
  attendance?: number | null;
  /**
   * Stadium display name. Resolved from `match.stadium.name` when the
   * relation is loaded (single match fetch); `null` for list responses
   * that don't join the stadium row.
   */
  venue?: string | null;

  /**
   * Cup context, populated by `MatchService.findOne` only when
   * `type === 'cup'` (single-match fetch). `null` for league matches
   * and for list responses (the FE doesn't need it to render the
   * matches list / archive / type-filter — the type badge is enough
   * there). The bracket page reads cupId from the URL, not from the
   * match entity.
   *
   * The `cupId` is resolved via a single
   * `CupBracketSlotEntity.findOne({ where: { matchId: id } })` —
   * both slot perspectives of a match share the same `matchId`, so
   * one row is enough. If a cup match has no slot row (shouldn't
   * happen in normal flow) the fields stay `null` and the FE
   * hides the "View bracket" link.
   */
  cupId?: string | null;
  cupRound?: number | null;
}
