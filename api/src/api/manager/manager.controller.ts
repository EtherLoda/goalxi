import { Uuid } from '@/common/types/common.type';
import { Public } from '@/decorators/public.decorator';
import { Controller, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ManagerPublicResDto } from './dto/manager-public.res.dto';
import { ManagerService } from './manager.service';

/**
 * The public manager profile.
 *
 * A separate controller rather than a `@Public()` route on
 * `UserController`: that controller's other routes are owner-scoped
 * (`/users/me`) and admin-scoped, and mixing a public read into it
 * invites a future guard change on one route to silently change the
 * exposure of the other. Different audiences, different module.
 */
@ApiTags('Manager')
@Controller({
  path: 'managers',
  version: '1',
})
export class ManagerController {
  constructor(private readonly managerService: ManagerService) {}

  /**
   * `GET /managers/:id` — public.
   *
   * Backs `/managers/[id]` and is the click target of every visitor
   * list entry and of the "manager" line on a club page.
   */
  @Public()
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: Uuid): Promise<ManagerPublicResDto> {
    return this.managerService.findPublic(id);
  }
}
