import { Uuid } from '@/common/types/common.type';
import { CurrentUser } from '@/decorators/current-user.decorator';
import { AuthGuard } from '@/guards/auth.guard';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { CreateAuctionReqDto } from './dto/create-auction.req.dto';
import { PlaceBidReqDto } from './dto/place-bid.req.dto';
import { AuctionResDto } from './dto/auction.res.dto';
import { AuctionService } from './auction.service';

@Controller('transfer')
@ApiTags('Transfer')
@ApiBearerAuth()
@UseGuards(AuthGuard)
export class TransferController {
    constructor(
        private readonly auctionService: AuctionService,
    ) { }

    // Auction endpoints
    @Get('auction')
    @ApiOperation({ summary: 'Get all active auctions' })
    async findAllAuctions(): Promise<AuctionResDto[]> {
        const auctions = await this.auctionService.findAllActive();
        return auctions.map(a => plainToInstance(AuctionResDto, a));
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
    ): Promise<AuctionResDto> {
        const auction = await this.auctionService.placeBid(userId, auctionId, dto);
        return plainToInstance(AuctionResDto, auction);
    }

    @Post('auction/:id/buyout')
    @ApiOperation({ summary: 'Buy out an auction immediately at buyout price' })
    async buyout(
        @CurrentUser('id') userId: Uuid,
        @Param('id') auctionId: Uuid,
    ): Promise<AuctionResDto> {
        const auction = await this.auctionService.buyout(userId, auctionId);
        return plainToInstance(AuctionResDto, auction);
    }
}
