import {
    ClassField,
    EnumField,
    NumberField,
    UUIDField,
} from '@/decorators/field.decorators';
import { Exclude, Expose, Type } from 'class-transformer';
import { AuctionStatus, BidRecord } from '../entities/auction.entity';
import { PlayerResDto } from '@/api/player/dto/player.res.dto';
import { TeamResDto } from '@/api/team/dto/team.res.dto';

@Exclude()
export class AuctionResDto {
    @UUIDField()
    @Expose()
    id: string;

    @ClassField(() => PlayerResDto)
    @Expose()
    player: PlayerResDto;

    @ClassField(() => TeamResDto)
    @Expose()
    team: TeamResDto;

    @NumberField()
    @Expose()
    startPrice: number;

    @NumberField()
    @Expose()
    buyoutPrice: number;

    @NumberField()
    @Expose()
    currentPrice: number;

    @ClassField(() => TeamResDto)
    @Expose()
    currentBidder?: TeamResDto;

    @ClassField(() => Date)
    @Expose()
    startedAt: Date;

    @ClassField(() => Date)
    @Expose()
    endsAt: Date;

    @Expose()
    @Type(() => Object)
    bidHistory: BidRecord[];

    @EnumField(() => AuctionStatus)
    @Expose()
    status: AuctionStatus;

    @ClassField(() => Date)
    @Expose()
    createdAt: Date;
}
