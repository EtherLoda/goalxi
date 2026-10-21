import { Expose, Type } from 'class-transformer';

/**
 * The minimum needed to render a link to another league: an id to build
 * the href and enough labels to say WHERE the link goes ("tier 4, division
 * 48"). Deliberately not a `LeagueResDto` — a neighbour is a destination,
 * not a page, and shipping eight unused columns per edge invites the FE to
 * render things it has no data for.
 */
export class LeagueNeighbourDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  /** 1 = top flight. */
  @Expose()
  tier: number;

  /** Which league inside the tier (1..divisionsInTier). */
  @Expose()
  tierDivision: number;
}

/**
 * Where a league sits in the pyramid, plus its four immediate neighbours.
 *
 * This is computed server-side on purpose. The browser could derive it from
 * `GET /leagues?tier=N`, but that means downloading all 64 divisions of a
 * tier to find the two adjacent ones, and it would make the client depend on
 * the pyramid's sort order. `up`/`down` in particular need the
 * `parent_league_id` link, which no list endpoint exposes.
 */
export class LeagueContextResDto {
  @Expose()
  @Type(() => LeagueNeighbourDto)
  league: LeagueNeighbourDto;

  /** Deepest tier number in the pyramid, so the FE can print "4 / 4". */
  @Expose()
  tierCount: number;

  /** How many leagues share this tier, so the FE can print "49 / 64". */
  @Expose()
  divisionsInTier: number;

  /** Previous division in the same tier, or null at the top of the list. */
  @Expose()
  @Type(() => LeagueNeighbourDto)
  prev: LeagueNeighbourDto | null;

  /** Next division in the same tier, or null at the bottom of the list. */
  @Expose()
  @Type(() => LeagueNeighbourDto)
  next: LeagueNeighbourDto | null;

  /** The league one tier above (null for the top flight). */
  @Expose()
  @Type(() => LeagueNeighbourDto)
  up: LeagueNeighbourDto | null;

  /** One league from the tier below (null for the bottom tier). */
  @Expose()
  @Type(() => LeagueNeighbourDto)
  down: LeagueNeighbourDto | null;
}
