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
  createdAt!: Date;
  updatedAt!: Date;
}
