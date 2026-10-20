import {
  AuctionEntity,
  calculatePlayerPWI,
  formatPWI,
  PlayerEntity,
} from '@goalxi/database';
import { plainToInstance } from 'class-transformer';
import { AuctionResDto } from './dto/auction.res.dto';
import { MyBidResDto } from './dto/my-bid.res.dto';

/**
 * PWI is a derived value: `PlayerEntity` has no `overall`/`pwi` column,
 * `PlayerService.mapToResDto` computes it while mapping. An auction nests the
 * player entity, so `plainToInstance(AuctionResDto, auction)` used to drop
 * those two fields entirely — the market UI then fell back to 0 and every
 * candidate read "综合 0".
 *
 * Compute it here instead of plumbing `PlayerService` into the transfer
 * module: same pure function, same result, no circular dependency.
 */
function withPwi(player: PlayerEntity) {
  const { pwi } = calculatePlayerPWI(player);
  return { ...player, overall: pwi, pwi, pwiDisplay: formatPWI(pwi) };
}

export function toAuctionResDto(auction: AuctionEntity): AuctionResDto {
  return plainToInstance(AuctionResDto, {
    ...auction,
    player: auction.player ? withPwi(auction.player) : auction.player,
  });
}

export function toMyBidResDto(
  auction: AuctionEntity,
  teamId: string,
): MyBidResDto {
  const dto = plainToInstance(MyBidResDto, {
    ...auction,
    player: auction.player ? withPwi(auction.player) : auction.player,
  });
  dto.isLeading = auction.currentBidderId === teamId;
  dto.isOutbid =
    auction.currentBidderId !== undefined &&
    auction.currentBidderId !== teamId &&
    auction.bidHistory.some((b) => b.teamId === teamId);
  return dto;
}
