import { NumberFieldOptional, StringFieldOptional } from '@/decorators/field.decorators';

export class UpdateLeagueReqDto {
    @StringFieldOptional()
    name?: string;

    @NumberFieldOptional({ min: 1 })
    tier?: number;

    @NumberFieldOptional({ min: 1 })
    tierDivision?: number;

    @StringFieldOptional()
    status?: string;

    @NumberFieldOptional({ min: 1 })
    maxTeams?: number;

    @NumberFieldOptional({ min: 0 })
    promotionSlots?: number;

    @NumberFieldOptional({ min: 0 })
    playoffSlots?: number;

    @NumberFieldOptional({ min: 0 })
    relegationSlots?: number;

    @StringFieldOptional()
    parentLeagueId?: string;
}
