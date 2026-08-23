import { CompetitionType, competitionTypeForMatch } from "./competition-type";

/**
 * Pin the league/cup/youth/other mapping that the simulator
 * uses to stamp `player_competition_stats.competitionType` on
 * insert. Migration 1737000000000 added the column and the DB
 * CHECK constraint; this test guards the writer-side helper
 * so the column never gets a value outside the four buckets.
 *
 * The order of checks inside `competitionTypeForMatch`
 * matters and is encoded in the priority below:
 *   1. `youthLeagueId` wins over `match.type` because the
 *      scheduler writes `match.type = "league"` for youth
 *      rows (a single value reused for two sub-cases).
 *   2. cup wins over league/playoff for the obvious reason.
 *   3. league + playoff share a bucket because both stamp
 *      a `league_standing` row.
 *   4. anything else (friendly / national_team / tournament)
 *      falls into OTHER, currently never reached.
 */
describe("competitionTypeForMatch", () => {
  it("classifies a senior league match as LEAGUE", () => {
    expect(
      competitionTypeForMatch({
        type: "league",
        youthLeagueId: null,
      }),
    ).toBe(CompetitionType.LEAGUE);
  });

  it("classifies a playoff (promotion/relegation) match as LEAGUE", () => {
    // Playoff is league-scored — it stamps a
    // `league_standing` row, so it shares a bucket with
    // senior league.
    expect(
      competitionTypeForMatch({
        type: "playoff",
        youthLeagueId: null,
      }),
    ).toBe(CompetitionType.LEAGUE);
  });

  it("classifies a cup match as CUP", () => {
    expect(
      competitionTypeForMatch({
        type: "cup",
        youthLeagueId: null,
      }),
    ).toBe(CompetitionType.CUP);
  });

  it("classifies a youth match as YOUTH even when match.type is league", () => {
    // The scheduler writes `match.type = "league"` for both
    // senior and youth rows; the discriminator is the
    // `youthLeagueId` set on the youth side. The function
    // has to consult `youthLeagueId` FIRST, not `match.type`.
    expect(
      competitionTypeForMatch({
        type: "league",
        youthLeagueId: "youth-league-uuid",
      }),
    ).toBe(CompetitionType.YOUTH);
  });

  it("classifies a youth cup match as YOUTH (youthLeagueId wins over cup)", () => {
    // If a youth cup ever exists, youthLeagueId is the
    // stronger signal. The helper must NOT return CUP for
    // a youth cup row — the FE renders it as "Youth"
    // with a youth-league context, not as a senior cup.
    expect(
      competitionTypeForMatch({
        type: "cup",
        youthLeagueId: "youth-league-uuid",
      }),
    ).toBe(CompetitionType.YOUTH);
  });

  it("falls back to OTHER for types the scheduler does not generate", () => {
    // The enum allows FRIENDLY, NATIONAL_TEAM, TOURNAMENT but
    // no code path produces them today. The bucket is
    // reserved so a future implementation can write the
    // column without migrating.
    for (const type of ["friendly", "national_team", "tournament", "what_is_this"]) {
      expect(
        competitionTypeForMatch({ type, youthLeagueId: null }),
      ).toBe(CompetitionType.OTHER);
    }
  });

  it("treats undefined youthLeagueId the same as null", () => {
    // Older call sites (e.g. fixtures, tests) pass match

    // shapes without the field. The helper must not blow up.
    expect(
      competitionTypeForMatch({ type: "league" }),
    ).toBe(CompetitionType.LEAGUE);
  });
});
