import { OffsetPaginatedDto } from '@/common/dto/offset-pagination/paginated.dto';
import { Uuid } from '@/common/types/common.type';
import { ApiAuth } from '@/decorators/http.decorators';
import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CreatePlayerReqDto } from './dto/create-player.req.dto';
import { ListPlayerReqDto } from './dto/list-player.req.dto';
import { PlayerResDto } from './dto/player.res.dto';
import { UpdatePlayerReqDto } from './dto/update-player.req.dto';
import { PlayerService } from './player.service';

import { Public } from '@/decorators/public.decorator';

@ApiTags('Players')
@Controller({
    path: 'players',
    version: '1',
})
export class PlayerController {
    constructor(private readonly playerService: PlayerService) { }

    @ApiAuth({ summary: 'Create a new player' })
    @Post()
    @ApiOkResponse({ type: PlayerResDto })
    async create(@Body() createPlayerDto: CreatePlayerReqDto): Promise<PlayerResDto> {
        return this.playerService.create(createPlayerDto);
    }

    @Public()
    @ApiAuth({ summary: 'Get all players' })
    @Get()
    @ApiOkResponse({ type: OffsetPaginatedDto<PlayerResDto> })
    async findAll(
        @Query() query: ListPlayerReqDto,
    ): Promise<OffsetPaginatedDto<PlayerResDto>> {
        return this.playerService.findMany(query);
    }

    @Public()
    @ApiAuth({ summary: 'Get a player by ID' })
    @Get(':id')
    @ApiOkResponse({ type: PlayerResDto })
    async findOne(@Param('id') id: Uuid): Promise<PlayerResDto> {
        return this.playerService.findOne(id);
    }

    @ApiAuth({ summary: 'Update a player' })
    @Patch(':id')
    @ApiOkResponse({ type: PlayerResDto })
    async update(
        @Param('id') id: Uuid,
        @Body() updatePlayerDto: UpdatePlayerReqDto,
    ): Promise<PlayerResDto> {
        return this.playerService.update(id, updatePlayerDto);
    }

    @ApiAuth({ summary: 'Delete a player' })
    @Delete(':id')
    @ApiOkResponse({ type: PlayerResDto })
    async remove(@Param('id') id: Uuid): Promise<void> {
        return this.playerService.delete(id);
    }
}
