import { AuctionResDto } from './auction.res.dto';

export class PlaceBidResDto extends AuctionResDto {
  lockedAmount!: number;
}
