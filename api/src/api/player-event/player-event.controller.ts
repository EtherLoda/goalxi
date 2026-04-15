import { Uuid } from '@/common/types/common.type';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CreatePlayerEventDto } from './dto/create-player-event.req.dto';
import { PlayerEventResDto } from './dto/player-event.res.dto';
import { PlayerEventService } from './player-event.service';

@Controller({
  path: 'player-events',
  version: '1',
})
export class PlayerEventController {
  constructor(private readonly playerEventService: PlayerEventService) {}

  @Get('player/:playerId')
  async findByPlayer(
    @Param('playerId') playerId: Uuid,
    @Query('season') season?: number,
  ): Promise<PlayerEventResDto[]> {
    return this.playerEventService.findByPlayer(playerId, season);
  }

  @Post()
  async create(@Body() dto: CreatePlayerEventDto): Promise<PlayerEventResDto> {
    return this.playerEventService.create(dto);
  }
}
