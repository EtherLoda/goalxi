import { AuthGuard } from '@/guards/auth.guard';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnnouncementService } from './announcement.service';
import { AnnouncementResDto } from './dto/announcement.res.dto';

@Controller({ path: 'announcements', version: '1' })
@ApiTags('Announcements')
@ApiBearerAuth()
@UseGuards(AuthGuard)
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Get()
  @ApiOperation({ summary: 'Get announcements' })
  async findAll(@Query('limit') limit?: string): Promise<AnnouncementResDto[]> {
    return this.announcementService.findAll(limit ? parseInt(limit, 10) : 10);
  }
}
