import { DefensiveLine, PitchWidth, Tempo } from '../types/tactical-dimensions';

export class TacticsResDto {
  id!: string;
  matchId!: string;
  teamId!: string;
  formation!: string;
  // Player ids are int (post-PlayerIdToNumeric migration). The legacy
  // `lineup` / `substitutions` jsonb columns on `match_tactics` were wiped
  // by the `MatchTacticsLineupToInt` migration; the API now reads/writes the
  // `lineupV2` / `substitutionsV2` columns exclusively.
  lineup!: Record<string, number>;
  instructions!: Record<string, any> | null;
  substitutions!: Array<{
    minute: number;
    out: number;
    in: number;
    /**
     * `undefined` (or absent) is treated as `always` by the engine.
     * Mirrors the field written by `MatchService.normaliseSubstitutions`.
     */
    condition?: string;
  }> | null;
  submittedAt!: Date;
  presetId!: string | null;
  tempo!: Tempo;
  pitchWidth!: PitchWidth;
  defensiveLine!: DefensiveLine;
}
