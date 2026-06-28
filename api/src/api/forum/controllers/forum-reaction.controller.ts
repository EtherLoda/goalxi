import { Uuid } from '@/common/types/common.type';
import { Public } from '@/decorators/public.decorator';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import {
  ReactionListResDto,
  ReactionSummaryResDto,
} from '../dto/reaction.res.dto';
import { ForumReactionService } from '../services/forum-reaction.service';

@ApiTags('Forum')
@Controller({
  path: 'forum/posts',
  version: '1',
})
export class ForumReactionController {
  constructor(private readonly reactionService: ForumReactionService) {}

  @Post(':postId/reactions')
  @HttpCode(HttpStatus.OK)
  async toggle(
    @Param('postId') postId: Uuid,
    @Req() req: Request,
  ): Promise<{ data: ReactionSummaryResDto }> {
    const data = await this.reactionService.toggle(
      postId,
      req['user'].id as Uuid,
    );
    return { data };
  }

  @Public()
  @Get(':postId/reactions')
  @HttpCode(HttpStatus.OK)
  async list(
    @Param('postId') postId: Uuid,
  ): Promise<{ data: ReactionListResDto }> {
    const data = await this.reactionService.listForPost(postId);
    return { data };
  }
}
