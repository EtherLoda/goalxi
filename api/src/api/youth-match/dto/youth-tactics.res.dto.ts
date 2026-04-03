import { SubstitutionDto } from '../../match/dto/substitution.dto';

export class YouthTacticsResDto {
  id!: string;
  youthMatchId!: string;
  teamId!: string;
  formation!: string;
  lineup!: Record<string, string>;
  instructions!: Record<string, any> | null;
  substitutions!: SubstitutionDto[] | null;
  createdAt!: Date;
}
