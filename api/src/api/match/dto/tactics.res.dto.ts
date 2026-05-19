import { SubstitutionDto } from './substitution.dto';
import { Tempo, PitchWidth, DefensiveLine } from '../types/tactical-dimensions';

export class TacticsResDto {
  id!: string;
  matchId!: string;
  teamId!: string;
  formation!: string;
  lineup!: Record<string, string>;
  instructions!: Record<string, any> | null;
  substitutions!: SubstitutionDto[] | null;
  submittedAt!: Date;
  presetId!: string | null;
  tempo!: Tempo;
  pitchWidth!: PitchWidth;
  defensiveLine!: DefensiveLine;
}
