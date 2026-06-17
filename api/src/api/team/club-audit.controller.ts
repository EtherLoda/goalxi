import { Uuid } from '@/common/types/common.type';
import { Controller, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ClubAuditEntry, ClubAuditService } from './club-audit.service';

@ApiTags('Team')
@Controller({
  path: 'teams/:teamId/audit',
  version: '1',
})
export class TeamAuditController {
  constructor(private readonly auditService: ClubAuditService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getRecent(@Param('teamId') teamId: Uuid): Promise<ClubAuditEntry[]> {
    return this.auditService.getRecent(teamId);
  }
}
