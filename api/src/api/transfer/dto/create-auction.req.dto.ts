import { NumberField } from '@/decorators/field.decorators';
import { IsOptional, Min } from 'class-validator';

export class CreateAuctionReqDto {
  @NumberField()
  playerId: number;

  @NumberField({ min: 1 })
  startPrice: number;

  @NumberField({ min: 1 })
  buyoutPrice: number;

  @IsOptional()
  @Min(1)
  durationHours?: number;
}
