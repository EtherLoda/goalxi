import { Uuid } from '@/common/types/common.type';
import { CurrentUser } from '@/decorators/current-user.decorator';
import { AuthGuard } from '@/guards/auth.guard';
import { TeamEntity } from '@goalxi/database';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';
import { AuctionService } from './auction.service';
import { AuctionResDto } from './dto/auction.res.dto';
import { BuyoutResDto } from './dto/buyout.res.dto';
import { CreateAuctionReqDto } from './dto/create-auction.req.dto';
import { MyBidResDto } from './dto/my-bid.res.dto';
import { PlaceBidReqDto } from './dto/place-bid.req.dto';
import { PlaceBidResDto } from './dto/place-bid.res.dto';
import { TransactionResDto } from './dto/transaction.res.dto';

@Controller({
  path: 'transfer',
  version: '1',
})
@ApiTags('Transfer')
@ApiBearerAuth()
@UseGuards(AuthGuard)
export class TransferController {
  constructor(
    private readonly auctionService: AuctionService,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
  ) {}

  // Auction endpoints
  @Get('auction')
  @ApiOperation({ summary: 'Get all active auctions' })
  async findAllAuctions(): Promise<AuctionResDto[]> {
    const auctions = await this.auctionService.findAllActive();
    return auctions.map((a) => plainToInstance(AuctionResDto, a));
  }

  @Get('auction/my-bids')
  @ApiOperation({ summary: 'Get auctions where current team has bid' })
  async findMyBids(@CurrentUser('id') userId: Uuid): Promise<MyBidResDto[]> {
    const team = await this.teamRepo.findOneBy({ userId });
    if (!team) throw new Error('User has no team');
    const auctions = await this.auctionService.findMyBids(team.id);
    return auctions.map((a) => {
      const dto = plainToInstance(MyBidResDto, a);
      dto.isLeading = a.currentBidderId === team.id;
      dto.isOutbid =
        a.currentBidderId !== undefined &&
        a.currentBidderId !== team.id &&
        a.bidHistory.some((b: any) => b.teamId === team.id);
      return dto;
    });
  }

  @Get('auction/my-listings')
  @ApiOperation({ summary: 'Get auctions listed by current team' })
  async findMyListings(
    @CurrentUser('id') userId: Uuid,
  ): Promise<AuctionResDto[]> {
    const team = await this.teamRepo.findOneBy({ userId });
    if (!team) throw new Error('User has no team');
    const auctions = await this.auctionService.findMyListings(team.id);
    return auctions.map((a) => plainToInstance(AuctionResDto, a));
  }

  @Get('transactions/purchases')
  @ApiOperation({ summary: 'Get purchase transactions for current team' })
  async findMyPurchases(
    @CurrentUser('id') userId: Uuid,
    @Query('date') date?: string,
    @Query('season') season?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{
    items: TransactionResDto[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const team = await this.teamRepo.findOneBy({ userId });
    if (!team) throw new Error('User has no team');
    const result = await this.auctionService.findMyPurchases(
      team.id,
      date,
      season ? parseInt(season, 10) : undefined,
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
    return {
      items: result.items.map((t) => plainToInstance(TransactionResDto, t)),
      meta: result.meta,
    };
  }

  @Get('transactions/sales')
  @ApiOperation({ summary: 'Get sale transactions for current team' })
  async findMySales(
    @CurrentUser('id') userId: Uuid,
    @Query('date') date?: string,
    @Query('season') season?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{
    items: TransactionResDto[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const team = await this.teamRepo.findOneBy({ userId });
    if (!team) throw new Error('User has no team');
    const result = await this.auctionService.findMySales(
      team.id,
      date,
      season ? parseInt(season, 10) : undefined,
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
    return {
      items: result.items.map((t) => plainToInstance(TransactionResDto, t)),
      meta: result.meta,
    };
  }

  @Post('auction')
  @ApiOperation({ summary: 'Create an auction for a player' })
  async createAuction(
    @CurrentUser('id') userId: Uuid,
    @Body() dto: CreateAuctionReqDto,
  ): Promise<AuctionResDto> {
    const auction = await this.auctionService.createAuction(userId, dto);
    return plainToInstance(AuctionResDto, auction);
  }

  @Post('auction/:id/bid')
  @ApiOperation({ summary: 'Place a bid on an auction' })
  async placeBid(
    @CurrentUser('id') userId: Uuid,
    @Param('id') auctionId: Uuid,
    @Body() dto: PlaceBidReqDto,
  ): Promise<PlaceBidResDto> {
    const result = await this.auctionService.placeBid(userId, auctionId, dto);
    return {
      ...plainToInstance(AuctionResDto, result.auction),
      lockedAmount: result.lockedAmount,
    };
  }

  @Post('auction/:id/buyout')
  @ApiOperation({ summary: 'Buy out an auction immediately at buyout price' })
  async buyout(
    @CurrentUser('id') userId: Uuid,
    @Param('id') auctionId: Uuid,
  ): Promise<BuyoutResDto> {
    return this.auctionService.buyout(userId, auctionId);
  }
}
