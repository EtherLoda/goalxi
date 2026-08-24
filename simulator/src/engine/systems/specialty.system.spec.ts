import { Player } from '../../types/player.types';
import {
  ActiveCoreSpecialty,
  SpecialtyEvent,
  applyTierMultiplier,
  attackLaneMultiplier,
  commandDefenseMultiplier,
  defenseLaneMultiplier,
  foulRateMultiplier,
  getEventMultiplier,
  gkSaveMultiplier,
  injuryChanceMultiplier,
  lateGameMentalMultiplier,
  midfieldControlMultiplier,
  pushDefenseMultiplier,
  pushOffenseMultiplier,
  selectAssistWeight,
  selectAttackTypeWeight,
  selectShooterCounterWeight,
  selectShooterReboundWeight,
  selectShooterWeight,
  selectShotTypeWeight,
  shotHeaderMultiplier,
} from './specialty.system';

// Minimal player fixture factory — the system only reads
// `attributes.coreSpecialty` and `attributes.coreSpecialtyTier`,
// so we stub the rest of the Player shape.
function playerWith(
  coreSpecialty: string | null,
  tier: 'GOLD' | 'SILVER' | 'BRONZE' = 'SILVER',
): Player {
  return {
    id: 1,
    name: 'Test',
    position: 'ST',
    attributes: {
      pace: 10,
      strength: 10,
      positioning: 10,
      composure: 10,
      freeKicks: 10,
      penalties: 10,
      finishing: 10,
      passing: 10,
      dribbling: 10,
      defending: 10,
      coreSpecialty,
      coreSpecialtyTier: tier,
    },
    currentStamina: 3,
    form: 5,
    experience: 5,
    exactAge: [20, 0],
    overall: 50,
    injuryPenalty: 1.0,
  } as unknown as Player;
}

// ────────────────────────────────────────────────────────────────────
// applyTierMultiplier — pure function, no Player state
// ────────────────────────────────────────────────────────────────────

describe('applyTierMultiplier', () => {
  it('Silver returns the base unchanged', () => {
    expect(applyTierMultiplier(1.10, 'SILVER')).toBeCloseTo(1.10, 5);
    expect(applyTierMultiplier(0.80, 'SILVER')).toBeCloseTo(0.80, 5);
  });

  it('Gold scales the base up (multiplicative exponent)', () => {
    // 1.10^1.4 ≈ 1.1427
    expect(applyTierMultiplier(1.10, 'GOLD')).toBeCloseTo(1.1427, 3);
    // 0.80^1.4 ≈ 0.7317 (more reduction for "lower is better" events)
    expect(applyTierMultiplier(0.80, 'GOLD')).toBeCloseTo(0.7317, 3);
  });

  it('Bronze scales the base down toward 1.0', () => {
    // 1.10^0.7 ≈ 1.0690 (mild boost still)
    expect(applyTierMultiplier(1.10, 'BRONZE')).toBeCloseTo(1.0690, 3);
    // 0.80^0.7 ≈ 0.8554 (less reduction for "lower is better" events)
    expect(applyTierMultiplier(0.80, 'BRONZE')).toBeCloseTo(0.8554, 3);
  });

  it('is monotone in tier for bases > 1.0', () => {
    const gold = applyTierMultiplier(1.10, 'GOLD');
    const silver = applyTierMultiplier(1.10, 'SILVER');
    const bronze = applyTierMultiplier(1.10, 'BRONZE');
    expect(gold).toBeGreaterThan(silver);
    expect(silver).toBeGreaterThan(bronze);
  });
});

// ────────────────────────────────────────────────────────────────────
// getEventMultiplier — no-specialty / deprecated / unknown paths
// ────────────────────────────────────────────────────────────────────

describe('getEventMultiplier — degenerate cases', () => {
  it('returns 1.0 when player has no specialty', () => {
    const p = playerWith(null);
    expect(getEventMultiplier(p, 'shot_header')).toBe(1.0);
    expect(getEventMultiplier(p, 'gk_save')).toBe(1.0);
    expect(getEventMultiplier(p, 'push_defense')).toBe(1.0);
  });

  it('returns 1.0 when player has a deprecated specialty (legacy data)', () => {
    const p = playerWith('LONG_SHOT'); // deprecated
    expect(getEventMultiplier(p, 'shot_header')).toBe(1.0);
    expect(getEventMultiplier(p, 'shot_long')).toBe(1.0);
  });

  it('returns 1.0 for an unknown code', () => {
    const p = playerWith('NOT_A_REAL_CODE');
    expect(getEventMultiplier(p, 'shot_header')).toBe(1.0);
  });

  it('returns 1.0 for (specialty, event) pairs that have no effect defined', () => {
    // POACHER has no shot_header effect — only select_shooter effects.
    const p = playerWith('POACHER');
    expect(getEventMultiplier(p, 'shot_header')).toBe(1.0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Per-event × per-specialty smoke tests
// ────────────────────────────────────────────────────────────────────

describe('per-event × per-specialty multipliers (Silver tier)', () => {
  // The "right answer" for each (event, specialty) cell is encoded
  // directly. If the BASE_EFFECTS table changes, update this table
  // — keeping it as data avoids the test becoming a restatement of
  // the implementation.
  type Cell = { event: SpecialtyEvent; specialty: ActiveCoreSpecialty; expected: number };

  const cells: Cell[] = [
    // shot_header: AERIAL_THREAT and PHYSICAL_BEAST both at 1.10
    { event: 'shot_header', specialty: 'AERIAL_THREAT', expected: 1.10 },
    { event: 'shot_header', specialty: 'PHYSICAL_BEAST', expected: 1.10 },
    { event: 'shot_header', specialty: 'POACHER', expected: 1.0 }, // not defined for shot_header

    // gk_save: SAVING_MASTER only
    { event: 'gk_save', specialty: 'SAVING_MASTER', expected: 1.10 },
    { event: 'gk_save', specialty: 'SWEEPER_KEEPER', expected: 1.0 },

    // attack_lane: SPEEDSTER and POACHER
    { event: 'attack_lane', specialty: 'SPEEDSTER', expected: 1.10 },
    { event: 'attack_lane', specialty: 'POACHER', expected: 1.10 },
    { event: 'attack_lane', specialty: 'WALL', expected: 1.0 },

    // defense_lane: WALL, SWEEPER_KEEPER
    { event: 'defense_lane', specialty: 'WALL', expected: 1.10 },
    { event: 'defense_lane', specialty: 'SWEEPER_KEEPER', expected: 1.05 },

    // push_offense
    { event: 'push_offense', specialty: 'DRIBBLER', expected: 1.15 },
    { event: 'push_offense', specialty: 'PLAYMAKER', expected: 1.10 },
    { event: 'push_offense', specialty: 'CROSSER', expected: 1.12 },

    // push_defense
    { event: 'push_defense', specialty: 'TACKLER', expected: 1.15 },
    { event: 'push_defense', specialty: 'WALL', expected: 1.18 },

    // midfield_control
    { event: 'midfield_control', specialty: 'TACKLER', expected: 1.20 },

    // select_shooter
    { event: 'select_shooter', specialty: 'POACHER', expected: 1.25 },
    { event: 'select_shooter_rebound', specialty: 'POACHER', expected: 1.25 },
    { event: 'select_shooter_counter', specialty: 'SPEEDSTER', expected: 1.20 },

    // select_assist
    { event: 'select_assist', specialty: 'PLAYMAKER', expected: 1.25 },
    { event: 'select_assist', specialty: 'CROSSER', expected: 1.20 },

    // select_attack_type / select_shot_type
    { event: 'select_attack_type', specialty: 'DRIBBLER', expected: 1.20 },
    { event: 'select_shot_type', specialty: 'CROSSER', expected: 1.20 },

    // foul_rate (values < 1.0)
    { event: 'foul_rate', specialty: 'TACKLER', expected: 0.80 },
    { event: 'foul_rate', specialty: 'DRIBBLER', expected: 0.90 },
    // COMPOSED halves the foul rate (per `docs/specialty-v2-design.md
    // §2.9 action point 4`). Wired in MatchEngine.resolveFoul.
    { event: 'foul_rate', specialty: 'COMPOSED', expected: 0.50 },

    // injury_chance
    { event: 'injury_chance', specialty: 'PHYSICAL_BEAST', expected: 0.90 },
    { event: 'injury_chance', specialty: 'AERIAL_THREAT', expected: 0.80 },

    // late_game_mental (COMPOSED placeholder — no consumer
    // yet, see specialty.system.ts and §2.9 of the v2 design
    // doc). Value 1.0 so the helper returns no-op for now.
    { event: 'late_game_mental', specialty: 'COMPOSED', expected: 1.0 },

    // command_defense
    { event: 'command_defense', specialty: 'SWEEPER_KEEPER', expected: 1.05 },
  ];

  cells.forEach(({ event, specialty, expected }) => {
    it(`${specialty} × ${event} = ${expected} (Silver)`, () => {
      const p = playerWith(specialty, 'SILVER');
      expect(getEventMultiplier(p, event)).toBeCloseTo(expected, 5);
    });
  });
});

describe('Gold/Bronze tier scales correctly for a known pair', () => {
  it('AERIAL_THREAT + shot_header: Gold > Silver > Bronze', () => {
    const gold = playerWith('AERIAL_THREAT', 'GOLD');
    const silver = playerWith('AERIAL_THREAT', 'SILVER');
    const bronze = playerWith('AERIAL_THREAT', 'BRONZE');
    const g = getEventMultiplier(gold, 'shot_header');
    const s = getEventMultiplier(silver, 'shot_header');
    const b = getEventMultiplier(bronze, 'shot_header');
    expect(g).toBeGreaterThan(s);
    expect(s).toBeGreaterThan(b);
    // And the numbers are what the formula predicts
    expect(g).toBeCloseTo(Math.pow(1.10, 1.4), 5);
    expect(s).toBeCloseTo(1.10, 5);
    expect(b).toBeCloseTo(Math.pow(1.10, 0.7), 5);
  });

  it('TACKLER + foul_rate: Gold gives the biggest reduction', () => {
    // For "lower is better" events, Gold should produce the smallest
    // (most-reduced) multiplier.
    const gold = getEventMultiplier(playerWith('TACKLER', 'GOLD'), 'foul_rate');
    const silver = getEventMultiplier(playerWith('TACKLER', 'SILVER'), 'foul_rate');
    const bronze = getEventMultiplier(playerWith('TACKLER', 'BRONZE'), 'foul_rate');
    expect(gold).toBeLessThan(silver);
    expect(silver).toBeLessThan(bronze);
  });
});

// ────────────────────────────────────────────────────────────────────
// Named convenience getters — just verify they map to the right event
// ────────────────────────────────────────────────────────────────────

describe('named convenience getters', () => {
  it('attackLaneMultiplier / defenseLaneMultiplier map to attack_lane / defense_lane', () => {
    const p = playerWith('SPEEDSTER', 'GOLD');
    expect(attackLaneMultiplier(p)).toBe(getEventMultiplier(p, 'attack_lane'));
    const p2 = playerWith('WALL', 'GOLD');
    expect(defenseLaneMultiplier(p2)).toBe(getEventMultiplier(p2, 'defense_lane'));
  });

  it('shot* helpers map to the right events', () => {
    const p = playerWith('AERIAL_THREAT', 'SILVER');
    expect(shotHeaderMultiplier(p)).toBe(1.10);
  });

  it('gkSaveMultiplier applies to SAVING_MASTER', () => {
    const p = playerWith('SAVING_MASTER', 'SILVER');
    expect(gkSaveMultiplier(p)).toBe(1.10);
  });

  it('push* helpers map to push_offense / push_defense', () => {
    const dribbler = playerWith('DRIBBLER', 'SILVER');
    const wall = playerWith('WALL', 'SILVER');
    expect(pushOffenseMultiplier(dribbler)).toBe(1.15);
    expect(pushDefenseMultiplier(wall)).toBe(1.18);
  });

  it('midfieldControlMultiplier applies to TACKLER', () => {
    const p = playerWith('TACKLER', 'SILVER');
    expect(midfieldControlMultiplier(p)).toBe(1.20);
  });

  it('select* helpers all return distinct values for distinct specialties', () => {
    const poacher = playerWith('POACHER', 'SILVER');
    const speedster = playerWith('SPEEDSTER', 'SILVER');
    expect(selectShooterWeight(poacher)).toBe(1.25);
    expect(selectShooterReboundWeight(poacher)).toBe(1.25);
    expect(selectShooterCounterWeight(speedster)).toBe(1.20);
  });

  it('select* weight helpers for PLAYMAKER / CROSSER', () => {
    expect(selectAssistWeight(playerWith('PLAYMAKER', 'SILVER'))).toBe(1.25);
    expect(selectAssistWeight(playerWith('CROSSER', 'SILVER'))).toBe(1.20);
    expect(selectAttackTypeWeight(playerWith('DRIBBLER', 'SILVER'))).toBe(1.20);
    expect(selectShotTypeWeight(playerWith('CROSSER', 'SILVER'))).toBe(1.20);
  });

  it('foulRateMultiplier / injuryChanceMultiplier / lateGameMentalMultiplier / commandDefenseMultiplier', () => {
    expect(foulRateMultiplier(playerWith('TACKLER', 'SILVER'))).toBe(0.80);
    expect(foulRateMultiplier(playerWith('DRIBBLER', 'SILVER'))).toBe(0.90);
    expect(foulRateMultiplier(playerWith('COMPOSED', 'SILVER'))).toBe(0.50);
    expect(injuryChanceMultiplier(playerWith('PHYSICAL_BEAST', 'SILVER'))).toBe(0.90);
    // AERIAL_THREAT injury reduction is jump-gated — without
    // actionType='jump' the helper returns 1.0 (no effect). Verifies
    // the gate lives in the helper and not the BASE_EFFECTS table.
    expect(injuryChanceMultiplier(playerWith('AERIAL_THREAT', 'SILVER'))).toBe(1.0);
    expect(injuryChanceMultiplier(playerWith('AERIAL_THREAT', 'SILVER'), 'jump')).toBe(0.80);
    expect(lateGameMentalMultiplier(playerWith('COMPOSED', 'SILVER'))).toBe(1.0);
    expect(commandDefenseMultiplier(playerWith('SWEEPER_KEEPER', 'SILVER'))).toBe(1.05);
  });
});

// ────────────────────────────────────────────────────────────────────
// Source-level tripwire — every SpecialtyEvent that has a row in
// `BASE_EFFECTS` must be consumed somewhere in the simulator. This
// guards the v1 → v2 dead-helper failure mode where the spec table
// was refactored, the `BASE_EFFECTS` row was added, but the engine
// never actually started calling the helper. We detect that at test
// time so a future contributor can't reintroduce a "designed but
// never wired" specialty event.
//
// Implementation: load `BASE_EFFECTS` and `SpecialtyEvent` as text
// from the source files (rather than importing the internal table,
// which is intentionally not exported), then for each event with a
// non-empty row, scan every `.ts` file under `simulator/src/engine/`
// (skipping this spec file and `specialty.system.ts` itself, which
// are the only places that legitimately reference every event as a
// string). If a hook row is defined but no engine call site uses the
// event, the test fails with a clear "dead hook" message.
//
// Forward-compat escape hatch: events with no BASE_EFFECTS row at
// all (e.g. `late_game_mental`, which is reserved for a future
// decision-quality hook) are not checked — the table is the source
// of truth, not the type union.
// ────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';

describe('specialty hook wire-up tripwire (source-level)', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const specialtySystemPath = path.join(
    repoRoot,
    'simulator/src/engine/systems/specialty.system.ts',
  );
  const specPath = __filename;

  function readSource(file: string): string {
    return fs.readFileSync(file, 'utf8');
  }

  // Recursive .ts scan under `simulator/src/engine/`. Returns a map
  // from absolute path → file contents. Excludes this spec file and
  // the system file under test (which legitimately lists every event
  // as a string in the `BASE_EFFECTS` table and the named helpers).
  function collectEngineSources(): Map<string, string> {
    const root = path.join(repoRoot, 'simulator/src/engine');
    const out = new Map<string, string>();
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && full.endsWith('.ts')) {
          if (full === specPath) continue;
          if (full === specialtySystemPath) continue;
          out.set(full, readSource(full));
        }
      }
    };
    walk(root);
    return out;
  }

  // Extract every event name that has a non-empty `BASE_EFFECTS` row.
  // We parse the table from source rather than importing it because
  // `BASE_EFFECTS` is intentionally not exported (it's a private
  // implementation detail of `getEventMultiplier`).
  function extractEventsWithHooks(systemSrc: string): string[] {
    const re = /^\s*([a-z_]+):\s*\{[\s\S]*?\b[A-Z_]+:\s*[0-9.]+/gm;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(systemSrc)) !== null) {
      out.push(m[1]);
    }
    return out;
  }

  // Map every event key to the named helper that consumes it.
  // Engine call sites use the named helper (e.g. `attackLaneMultiplier`),
  // and the helper internally calls `getEventMultiplier(player, 'attack_lane')`
  // — the string literal only lives inside `specialty.system.ts` itself.
  // Without this map, the tripwire would false-positive every event
  // that goes through a named helper (which is most of them).
  //
  // Convention: snake_case event → camelCase + (Multiplier | Weight).
  // `select_*` events use the `Weight` suffix; everything else uses
  // `Multiplier`. Keep this in sync with `specialty.system.ts`.
  const eventToHelper: Record<string, string> = {
    attack_lane: 'attackLaneMultiplier',
    defense_lane: 'defenseLaneMultiplier',
    shot_header: 'shotHeaderMultiplier',
    shot_long: 'shotLongMultiplier',
    shot_rebound: 'shotReboundMultiplier',
    shot_one_on_one: 'shotOneOnOneMultiplier',
    shot_normal: 'shotNormalMultiplier',
    gk_save: 'gkSaveMultiplier',
    push_offense: 'pushOffenseMultiplier',
    push_defense: 'pushDefenseMultiplier',
    midfield_control: 'midfieldControlMultiplier',
    select_shooter: 'selectShooterWeight',
    select_shooter_rebound: 'selectShooterReboundWeight',
    select_shooter_counter: 'selectShooterCounterWeight',
    select_assist: 'selectAssistWeight',
    select_attack_type: 'selectAttackTypeWeight',
    select_shot_type: 'selectShotTypeWeight',
    foul_rate: 'foulRateMultiplier',
    injury_chance: 'injuryChanceMultiplier',
    late_game_mental: 'lateGameMentalMultiplier',
    command_defense: 'commandDefenseMultiplier',
  };

  const systemSrc = readSource(specialtySystemPath);
  const eventsWithHooks = extractEventsWithHooks(systemSrc);
  const engineSources = collectEngineSources();

  // Events that the spec explicitly reserves as a placeholder until
  // a real engine consumer exists. The BASE_EFFECTS row stays as a
  // no-op (1.0) so future contributors can populate it without
  // touching the engine call site map. See
  // `docs/specialty-v2-design.md` §2.9 for the COMPOSED late-game
  // hook, which is the only entry in this list today. The tripwire
  // skips these so the design doc's "leave it in the table" intent
  // is preserved; updating this list requires a SPEC doc change in
  // the same commit.
  const RESERVED_PLACEHOLDERS = new Set<string>(['late_game_mental']);
  const liveEvents = eventsWithHooks.filter(
    (e) => !RESERVED_PLACEHOLDERS.has(e),
  );

  it('BASE_EFFECTS exposes at least the design-doc events', () => {
    // Defensive — if the parser above breaks, this fails loudly
    // instead of silently allowing the next test to pass.
    expect(eventsWithHooks.length).toBeGreaterThan(10);
  });

  it('event→helper map covers every BASE_EFFECTS row', () => {
    // If a new event is added to BASE_EFFECTS without updating the
    // map, the tripwire falls back to string-literal-only search and
    // would false-positive. This test forces the contributor to
    // update the map alongside the table.
    const missing = liveEvents.filter((event) => !(event in eventToHelper));
    expect(missing).toEqual([]);
  });

  it.each(liveEvents)(
    'specialty event "%s" is consumed by at least one engine file',
    (event) => {
      // A hook is "consumed" if EITHER:
      //   (a) the literal `'event_name'` appears in an engine file
      //       (caller is using `getEventMultiplier` directly, or
      //       `teamMaxEventMultiplier` with the event as a string), OR
      //   (b) the named helper for this event is called from an
      //       engine file.
      // Both are equivalent ways of consuming the hook — most callers
      // use the named helper. The string-literal fallback handles
      // the `teamMaxEventMultiplier` / `teamMaxEventCached` path used
      // by `Team.updateSnapshot` and `match.engine.ts` for several
      // hooks.
      const stringHits: string[] = [];
      const helperName = eventToHelper[event];
      const helperNeedle = helperName ? `${helperName}(` : null;
      const helperHits: string[] = [];
      for (const [file, src] of engineSources) {
        const rel = path.relative(repoRoot, file);
        if (src.includes(`'${event}'`)) {
          stringHits.push(rel);
        }
        if (helperNeedle && src.includes(helperNeedle)) {
          helperHits.push(rel);
        }
      }
      const matchingFiles = Array.from(
        new Set([...stringHits, ...helperHits]),
      );
      expect({
        event,
        helper: helperName,
        stringLiteralHits: stringHits,
        helperCallHits: helperHits,
        matchingFiles,
        searchedFiles: engineSources.size,
        message: `specialty event '${event}' has a BASE_EFFECTS row but no engine file consumes it (no '${event}' literal and no ${helperName ?? '(no named helper)'}() call) — likely a dead hook`,
      }).toEqual(
        expect.objectContaining({
          matchingFiles: expect.arrayContaining([expect.any(String)]),
        }),
      );
    },
  );
});
