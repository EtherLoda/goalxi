import { DefensiveLine, PitchWidth, Tempo } from '../types/tactical-dimensions';
import { SubstitutionDto } from './substitution.dto';

export class TacticsResDto {
  id!: string;
  matchId!: string;
  teamId!: string;
  formation!: string;
  // Player ids can be number (post-migration) or string (legacy rows
  // surviving the wipe). Keep the union loose on the wire so the API
  // contract doesn't break while the data store is in transition.
  lineup!: Record<string, string | number>;
  instructions!: Record<string, any> | null;
  substitutions!: Array<{
    minute: number;
    out: string | number;
    in: string | number;
  }> | null;
  submittedAt!: Date;
  presetId!: string | null;
  tempo!: Tempo;
  pitchWidth!: PitchWidth;
  defensiveLine!: DefensiveLine;
}
