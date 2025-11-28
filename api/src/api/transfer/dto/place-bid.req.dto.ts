import { NumberField } from '@/decorators/field.decorators';

export class PlaceBidReqDto {
    @NumberField({ min: 1 })
    amount: number;
}
