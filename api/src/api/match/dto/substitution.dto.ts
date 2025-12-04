import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class SubstitutionDto {
    @IsInt()
    @Min(1)
    @Max(90)
    minute!: number;

    @IsUUID()
    out!: string;

    @IsUUID()
    in!: string;
}
