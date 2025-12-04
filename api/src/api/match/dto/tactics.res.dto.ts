import { SubstitutionDto } from './substitution.dto';

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
}
