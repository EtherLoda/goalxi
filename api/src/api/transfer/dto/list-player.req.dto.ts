import { NumberField, UUIDField } from '@/decorators/field.decorators';

export class ListPlayerReqDto {
    @UUIDField()
    playerId: string;

    @NumberField({ min: 1 })
    price: number;
}
