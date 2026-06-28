import { OffsetPaginationDto } from '@/common/dto/offset-pagination/offset-pagination.dto';
import { PageOptionsDto } from '@/common/dto/offset-pagination/page-options.dto';
import { Uuid } from '@/common/types/common.type';
import { Public } from '@/decorators/public.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CreatePostReqDto } from '../dto/create-post.req.dto';
import { PostResDto } from '../dto/post.res.dto';
import { ForumPostService } from '../services/forum-post.service';

@ApiTags('Forum')
@Controller({
  path: 'forum',
  version: '1',
})
export class ForumPostController {
  constructor(private readonly postService: ForumPostService) {}

  @Public()
  @Get('threads/:threadId/posts')
  @HttpCode(HttpStatus.OK)
  async listByThread(
    @Param('threadId') threadId: Uuid,
    @Query() pageOptions: PageOptionsDto,
  ): Promise<{ data: PostResDto[]; pagination: OffsetPaginationDto }> {
    const [data, pagination] = await this.postService.listByThread(
      threadId,
      pageOptions,
    );
    return { data, pagination };
  }

  @Post('threads/:threadId/posts')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('threadId') threadId: Uuid,
    @Body() dto: CreatePostReqDto,
    @Req() req: Request,
  ): Promise<{ data: PostResDto }> {
    const data = await this.postService.create(
      req['user'].id as Uuid,
      threadId,
      dto,
    );
    return { data };
  }

  @Delete('posts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: Uuid, @Req() req: Request): Promise<void> {
    await this.postService.softDelete(id, req['user'].id as Uuid);
  }
}
