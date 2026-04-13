import { BooleanField } from '@/decorators/field.decorators';
import { Exclude, Expose } from 'class-transformer';
import { AuctionResDto } from './auction.res.dto';

@Exclude()
export class MyBidResDto extends AuctionResDto {
  @BooleanField()
  @Expose()
  isLeading: boolean;

  @BooleanField()
  @Expose()
  isOutbid: boolean;
}
