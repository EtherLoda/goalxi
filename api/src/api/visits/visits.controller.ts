import { Uuid } from '@/common/types/common.type';
import { CurrentUser } from '@/decorators/current-user.decorator';
import { Public } from '@/decorators/public.decorator';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ListVisitsReqDto, RecordVisitReqDto } from './dto/visit.req.dto';
import { VisitListResDto } from './dto/visit.res.dto';
import { VisitsService } from './visits.service';

@ApiTags('visits')
@Controller({
  path: 'visits',
  version: '1',
})
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  /**
   * Fire-and-forget page-view ping.
   *
   * 204 for every outcome — the caller is a tracker that must never have
   * to handle a response, and a failed ping is not worth a retry. The
   * frontend only calls this while logged in, which is how "don't record
   * anonymous visitors" (plan D3) is enforced.
   */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async record(
    @Body() dto: RecordVisitReqDto,
    @CurrentUser('id') visitorUserId: Uuid,
  ): Promise<void> {
    await this.visitsService.record(dto, visitorUserId);
  }

  /** Public: the panel is shown to everyone, logged in or not (plan D2). */
  @Public()
  @Get()
  list(@Query() dto: ListVisitsReqDto): Promise<VisitListResDto> {
    return this.visitsService.list(dto);
  }
}
