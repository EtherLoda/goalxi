import { Expose, Type } from 'class-transformer';

/**
 * One row of the league's "team status" board: how each club's squad looks
 * right now, without leaving the league page.
 *
 * Every counter is a small integer and every one of them is something a
 * manager can act on: cards and injuries change what you can field, the
 * listing count is a shopping signal, and arrivals/departures tell you who
 * is rebuilding. That is why they live together — on their own, each one is
 * trivia.
 */
export class LeagueTeamStatusDto {
  @Expose()
  teamId: string;

  @Expose()
  teamName: string;

  /** 1-based rank, matching the standings order this board is aligned to. */
  @Expose()
  position: number;

  /** Red cards shown this season (not the current suspension count). */
  @Expose()
  redCards: number;

  /** Squad members currently carrying an injury, minor or severe. */
  @Expose()
  injured: number;

  /** Squad members currently offered on the transfer market. */
  @Expose()
  listed: number;

  /** Players who joined through a completed transfer inside the window. */
  @Expose()
  joined: number;

  /** Players who left through a completed transfer inside the window. */
  @Expose()
  left: number;
}

/**
 * The board plus the two facts needed to read it honestly: which season the
 * card/injury counts cover, and how far back the transfer window reaches.
 *
 * The window is shipped rather than hard-coded in the UI because it is the
 * one number most likely to change ("last 7 days" is a guess, not a law),
 * and a client that prints its own default would silently disagree with the
 * data it is looking at.
 */
export class LeagueTeamStatusResDto {
  @Expose()
  @Type(() => LeagueTeamStatusDto)
  items: LeagueTeamStatusDto[];

  /** Season the red-card counts were taken from. */
  @Expose()
  season: number;

  /** How many days back `joined` / `left` reach. */
  @Expose()
  transferWindowDays: number;
}
