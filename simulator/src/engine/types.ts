import { MatchEventType } from '@goalxi/database';

export { MatchEventType };

// NOTE: this module used to also declare `Zone`, `TeamMatchStats`,
// `MatchState` and `SimulationConfig`. They described the tick-based
// `match-state.ts` model, whose only consumer was the equally dead
// `EventGenerator` stub in `event.generator.ts`. The live engine keeps all
// of that as private fields on `MatchEngine` (see `match.engine.ts`), so the
// declarations were removed 2026-08 rather than left to drift out of sync
// with the real state shape. `MatchEventType` stays: it is the one symbol
// every engine module imports from here.
