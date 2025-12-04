import { SubstitutionDto } from './substitution.dto';

export class PresetResDto {
    id!: string;
    teamId!: string;
    name!: string;
    isDefault!: boolean;
    formation!: string;
    lineup!: Record<string, string>;
    instructions!: Record<string, any> | null;
    substitutions!: SubstitutionDto[] | null;
    createdAt!: Date;
    updatedAt!: Date;
}
