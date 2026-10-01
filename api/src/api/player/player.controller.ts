import { OffsetPaginatedDto } from '@/common/dto/offset-pagination/paginated.dto';
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
import { PlayerPublicResDto, PlayerResDto } from './dto/player.res.dto';
import { UpdatePlayerReqDto } from './dto/update-player.req.dto';
import { PlayerService } from './player.service';

import { Public } from '@/decorators/public.decorator';

@ApiTags('Players')
@Controller({
  path: 'players',
  version: '1',
})
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @ApiAuth({ summary: 'Create a new player' })
  @Post()
  @ApiOkResponse({ type: PlayerResDto })
  async create(
    @Body() createPlayerDto: CreatePlayerReqDto,
  ): Promise<PlayerResDto> {
    return this.playerService.create(createPlayerDto);
  }

  @Public()
  @ApiAuth({ summary: 'Get all players' })
  @Get()
  @ApiOkResponse({ type: OffsetPaginatedDto<PlayerResDto> })
  async findAll(
    @Query() query: ListPlayerReqDto,
  ): Promise<OffsetPaginatedDto<PlayerResDto | PlayerPublicResDto>> {
    return this.playerService.findMany(query);
  }

  @Public()
  @ApiAuth({ summary: 'Get a player by ID' })
  @Get(':id')
  @ApiOkResponse({ type: PlayerResDto })
  async findOne(@Param('id') id: string): Promise<PlayerResDto> {
    return this.playerService.findOne(id);
  }

  @ApiAuth({ summary: 'Update a player' })
  @Patch(':id')
  @ApiOkResponse({ type: PlayerResDto })
  async update(
    @Param('id') id: number,
    @Body() updatePlayerDto: UpdatePlayerReqDto,
  ): Promise<PlayerResDto> {
    return this.playerService.update(id, updatePlayerDto);
  }

  @ApiAuth({ summary: 'Delete a player' })
  @Delete(':id')
  @ApiOkResponse({ type: PlayerResDto })
  async remove(@Param('id') id: number): Promise<void> {
    return this.playerService.delete(id);
  }

  /**
   * ⛔ **FROZEN SUBSYSTEM** — both endpoints below.
   *
   * Youth development is paused indefinitely (see the "Youth Pipeline"
   * section of `CLAUDE.md`). These routes and the service methods behind
   * them are NOT dead code to be removed — they are the frozen
   * subsystem's live surface, kept working. Do not delete them as
   * "cleanup", and do not extend them with new youth features, without an
   * explicit go-ahead from the maintainer.
   *
   * What is still allowed here: minimal, self-contained bug fixes to code
   * that is actively running.
   */

  /**
   * [WAVE B2] Release a youth player from the academy. Distinct from
   * `DELETE /players/:id` — refuses to operate on a senior player so
   * a UI typo can never dump a contracted first-teamer.
   */
  @ApiAuth({ summary: 'Release a youth player from the academy' })
  @Post(':id/release')
  @ApiOkResponse({ type: PlayerResDto })
  async release(@Param('id') id: number): Promise<void> {
    return this.playerService.releaseYouth(id);
  }

  /**
   * [RFC 0001] Promote a youth player to the senior squad.
   * Flips `is_youth` to false and reveals all skills. The player row
   * stays the same; no data is copied. Requires the player to have
   * ≥ 50% skills revealed (server-enforced gate — see the note on
   * `PlayerService.promote` for why that gate must not be relaxed).
   */
  @ApiAuth({ summary: 'Promote a youth player to senior squad' })
  @Post(':id/promote')
  @ApiOkResponse({ type: PlayerResDto })
  async promote(@Param('id') id: number): Promise<PlayerResDto> {
    return this.playerService.promote(id);
  }
}
