import { NumberFieldOptional, StringFieldOptional } from '@/decorators/field.decorators';

export class UpdateLeagueReqDto {
    @StringFieldOptional()
    name?: string;



    @NumberFieldOptional({ min: 1 })
    tier?: number;

    @NumberFieldOptional({ min: 1 })
    division?: number;

    @StringFieldOptional()
    status?: string;
}
