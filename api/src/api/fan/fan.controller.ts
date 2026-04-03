import { Uuid } from '@/common/types/common.type';
import { Public } from '@/decorators/public.decorator';
import { Controller, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FanService } from './fan.service';

@ApiTags('Fan')
@Controller({
  path: 'teams/:teamId/fans',
  version: '1',
})
export class FanController {
  constructor(private readonly fanService: FanService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async getFans(@Param('teamId') teamId: Uuid) {
    return this.fanService.getByTeamId(teamId);
  }
}
