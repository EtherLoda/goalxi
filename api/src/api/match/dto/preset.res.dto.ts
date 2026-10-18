import { TeamTacticCode } from '@goalxi/database';
import { DefensiveLine, PitchWidth, Tempo } from '../types/tactical-dimensions';
import { SubstitutionDto } from './substitution.dto';

export class PresetResDto {
  id!: string;
  teamId!: string;
  name!: string;
  isDefault!: boolean;
  formation!: string;
  // Player ids are int (post-PlayerIdToNumeric migration). See
  // TacticsResDto.lineup for the legacy/v2 column story.
  lineup!: Record<string, number>;
  instructions!: Record<string, any> | null;
  substitutions!: SubstitutionDto[] | null;
  tempo!: Tempo;
  pitchWidth!: PitchWidth;
  defensiveLine!: DefensiveLine;
  /** `null` = this preset carries no team tactic (a real choice, not a gap). */
  teamTactic!: TeamTacticCode | null;
  createdAt!: Date;
  updatedAt!: Date;
}
