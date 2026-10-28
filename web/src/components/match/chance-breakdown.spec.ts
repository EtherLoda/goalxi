import type { MatchEvent } from "@/lib/api";
import { buildChanceBreakdown } from "./chance-breakdown";

const HOME = "team-home";
const AWAY = "team-away";

function ev(partial: Partial<MatchEvent> & { type: string }): MatchEvent {
  return {
    id: partial.id ?? `${partial.type}-${Math.random().toString(36).slice(2)}`,
    matchId: "m1",
    minute: partial.minute ?? 10,
    second: 0,
    typeName: partial.typeName ?? partial.type,
    data: {},
    ...partial,
  } as MatchEvent;
}

describe("buildChanceBreakdown", () => {
  it("files open-play shots by lane", () => {
    const events = [
      ev({ type: "goal", isHome: true, data: { lane: "left", shot: { result: "goal" } } }),
      ev({ type: "save", isHome: false, data: { lane: "center", shot: { result: "save" } } }),
      ev({ type: "miss", isHome: false, data: { lane: "right", shot: { result: "miss" } } }),
    ];

    const result = buildChanceBreakdown(events, HOME, AWAY);
    expect(result.home).toBe(1);
    expect(result.away).toBe(2);
    expect(result.rows).toEqual([
      { lane: "left", home: 1, away: 0 },
      { lane: "center", home: 0, away: 1 },
      { lane: "right", home: 0, away: 1 },
      { lane: "setPiece", home: 0, away: 0 },
    ]);
  });

  it("counts every set-piece type in one bucket, goals included", () => {
    const events = [
      ev({ type: "corner", isHome: true, data: { setPieceType: "corner" } }),
      ev({ type: "goal", isHome: true, data: { setPieceType: "corner" } }),
      ev({ type: "goal", isHome: true, data: { setPieceType: "direct_free_kick" } }),
      ev({ type: "free_kick", isHome: false, data: { setPieceType: "indirect_free_kick" } }),
      ev({ type: "goal", isHome: false, data: { setPieceType: "penalty" } }),
      ev({ type: "penalty_miss", isHome: false, data: { setPieceType: "penalty" } }),
    ];

    const result = buildChanceBreakdown(events, HOME, AWAY);
    const setPiece = result.rows.find((row) => row.lane === "setPiece");
    expect(setPiece).toEqual({ lane: "setPiece", home: 3, away: 3 });
    expect(result.home).toBe(3);
    expect(result.away).toBe(3);
  });

  it("counts a blocked push as a chance in its lane", () => {
    const events = [
      ev({
        type: "miss",
        isHome: true,
        data: { lane: "center", ffinalResult: "blocked", shot: null },
      }),
    ];

    const result = buildChanceBreakdown(events, HOME, AWAY);
    expect(result.rows.find((row) => row.lane === "center")).toEqual({
      lane: "center",
      home: 1,
      away: 0,
    });
  });

  it("ignores turnovers, cards and other non-chance events", () => {
    const events = [
      ev({ type: "turnover", isHome: true, data: { lane: "left", ffinalResult: "defense_stopped" } }),
      ev({ type: "yellow_card", isHome: true, data: { lane: "left" } }),
      ev({ type: "kickoff", isHome: true }),
    ];

    expect(buildChanceBreakdown(events, HOME, AWAY)).toEqual({
      home: 0,
      away: 0,
      rows: [
        { lane: "left", home: 0, away: 0 },
        { lane: "center", home: 0, away: 0 },
        { lane: "right", home: 0, away: 0 },
        { lane: "setPiece", home: 0, away: 0 },
      ],
    });
  });

  it("reads the shot out of data.sequence for persisted events", () => {
    // Shape as stored by the API: the shot lives one level down, so a
    // flat `data.shot` test finds nothing and every open-play chance
    // silently disappears (this shipped once).
    const events = [
      ev({
        type: "save",
        teamId: HOME,
        data: {
          lane: "left",
          ffinalResult: "save",
          sequence: { shot: { result: "save", shooter: "A" }, attackPush: {} },
        },
      }),
      ev({
        type: "goal",
        teamId: AWAY,
        data: {
          lane: "center",
          ffinalResult: "goal",
          sequence: { shot: { result: "goal", shooter: "B" }, attackPush: {} },
        },
      }),
      // A turnover has the same `sequence` wrapper but no shot in it.
      ev({
        type: "turnover",
        teamId: AWAY,
        data: {
          lane: "center",
          ffinalResult: "defense_stopped",
          sequence: { shot: null, attackPush: {} },
        },
      }),
    ];

    const result = buildChanceBreakdown(events, HOME, AWAY);
    expect(result.home).toBe(1);
    expect(result.away).toBe(1);
    expect(result.rows).toEqual([
      { lane: "left", home: 1, away: 0 },
      { lane: "center", home: 0, away: 1 },
      { lane: "right", home: 0, away: 0 },
      { lane: "setPiece", home: 0, away: 0 },
    ]);
  });

  it("skips penalty-shootout kicks", () => {
    const events = [
      ev({ type: "penalty_goal", minute: 120, isHome: true, data: { isPenalty: true } }),
      ev({ type: "penalty_miss", minute: 120, isHome: false, data: { isPenalty: true } }),
    ];

    const result = buildChanceBreakdown(events, HOME, AWAY);
    expect(result.home + result.away).toBe(0);
  });

  it("falls back to teamId when isHome is missing, and drops neutral events", () => {
    const events = [
      ev({ type: "save", teamId: HOME, data: { lane: "right", shot: {} } }),
      ev({ type: "save", teamId: AWAY, data: { lane: "right", shot: {} } }),
      ev({ type: "save", teamId: "someone-else", data: { lane: "right", shot: {} } }),
      ev({ type: "save", data: { lane: "right", shot: {} } }),
    ];

    const right = buildChanceBreakdown(events, HOME, AWAY).rows.find(
      (row) => row.lane === "right",
    );
    expect(right).toEqual({ lane: "right", home: 1, away: 1 });
  });
});
