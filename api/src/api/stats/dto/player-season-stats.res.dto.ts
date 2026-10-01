import { Expose, Type } from 'class-transformer';

/**
 * One row per (league, season) the player has competition stats for.
 *
 * `leagueId` and `leagueName` are nullable because cup / youth matches
 * stamp `match.leagueId = null` (we made `PlayerCompetitionStatsEntity`
 * nullable in migration 1736000000000) — a player can have stats
 * from non-league competitions too. The `competitionType` field
 * below is the explicit discriminator (added by migration
 * 1737000000000) that the FE should use to render a
 * league/cup/youth split without inferring it from the
 * null-state of leagueId.
 */
export class PlayerSeasonStatsEntryDto {
  @Expose()
  leagueId!: string | null;

  @Expose()
  leagueName!: string | null;

  // Explicit league/cup/youth/other bucket. See
  // `CompetitionType` in `@goalxi/database`. The string values
  // are uppercase to match the column default in the DB.
  @Expose()
  competitionType!: 'LEAGUE' | 'CUP' | 'YOUTH' | 'OTHER';

  @Expose()
  season!: number;

  @Expose()
  teamId!: string;

  @Expose()
  teamName!: string;

  @Expose()
  goals!: number;

  @Expose()
  assists!: number;

  @Expose()
  tackles!: number;

  @Expose()
  yellowCards!: number;

  @Expose()
  redCards!: number;

  @Expose()
  appearances!: number;

  @Expose()
  starts!: number;

  @Expose()
  substituteAppearances!: number;
}

/**
 * Aggregated career totals across every season row. The FE renders
 * this as a strip of big-number KPI cards (career goals, career
 * assists, etc.) above the per-season table.
 */
export class PlayerCareerStatsDto {
  @Expose()
  goals!: number;

  @Expose()
  assists!: number;

  @Expose()
  tackles!: number;

  @Expose()
  yellowCards!: number;

  @Expose()
  redCards!: number;

  @Expose()
  appearances!: number;

  @Expose()
  starts!: number;

  @Expose()
  substituteAppearances!: number;

  @Expose()
  seasonsPlayed!: number;
}

export class PlayerSeasonStatsResDto {
  @Expose()
  playerId!: number;

  @Expose()
  playerName!: string;

  @Expose()
  @Type(() => PlayerSeasonStatsEntryDto)
  seasons!: PlayerSeasonStatsEntryDto[];

  @Expose()
  @Type(() => PlayerCareerStatsDto)
  career!: PlayerCareerStatsDto;
}
