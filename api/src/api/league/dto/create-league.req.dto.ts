import { NumberField, StringField } from '@/decorators/field.decorators';

export class CreateLeagueReqDto {
    @StringField()
    name: string;



    @NumberField({ required: false, min: 1 })
    tier?: number;

    @NumberField({ required: false, min: 1 })
    division?: number;

    @StringField({ required: false })
    status?: string;
}
