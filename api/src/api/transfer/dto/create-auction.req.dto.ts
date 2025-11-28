import { NumberField, UUIDField } from '@/decorators/field.decorators';

export class CreateAuctionReqDto {
    @UUIDField()
    playerId: string;

    @NumberField({ min: 1 })
    startPrice: number;

    @NumberField({ min: 1 })
    buyoutPrice: number;

    @NumberField({ min: 1, int: true })
    durationHours: number;
}
