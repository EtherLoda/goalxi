import { OffsetPaginationDto } from '@/common/dto/offset-pagination/offset-pagination.dto';
import { PageOptionsDto } from '@/common/dto/offset-pagination/page-options.dto';
import { Uuid } from '@/common/types/common.type';
import { Public } from '@/decorators/public.decorator';
import { ForumThreadSort } from '@goalxi/database';
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
import { CreateThreadReqDto } from '../dto/create-thread.req.dto';
import { ListThreadsReqDto } from '../dto/list-threads.req.dto';
import { ThreadResDto } from '../dto/thread.res.dto';
import { ForumThreadService } from '../services/forum-thread.service';

@ApiTags('Forum')
@Controller({
  path: 'forum',
  version: '1',
})
export class ForumThreadController {
  constructor(private readonly threadService: ForumThreadService) {}

  @Public()
  @Get('categories/:categoryId/threads')
  @HttpCode(HttpStatus.OK)
  async listByCategory(
    @Param('categoryId') categoryId: Uuid,
    @Query() pageOptions: ListThreadsReqDto,
  ): Promise<{ data: ThreadResDto[]; pagination: OffsetPaginationDto }> {
    const sort = pageOptions.sort ?? ForumThreadSort.LATEST;
    const [data, pagination] = await this.threadService.listByCategory(
      categoryId,
      pageOptions as PageOptionsDto,
      sort,
    );
    return { data, pagination };
  }

  @Public()
  @Post('categories/:categoryId/threads')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('categoryId') categoryId: Uuid,
    @Body() dto: CreateThreadReqDto,
    @Req() req: Request,
  ): Promise<{ data: ThreadResDto }> {
    // Override DTO categoryId from URL param to keep them in sync
    const data = await this.threadService.create(req['user'].id as Uuid, {
      ...dto,
      categoryId,
    });
    return { data };
  }

  @Public()
  @Get('threads/:id')
  @HttpCode(HttpStatus.OK)
  async getById(@Param('id') id: Uuid): Promise<{ data: ThreadResDto }> {
    const data = await this.threadService.getById(id);
    return { data };
  }

  @Delete('threads/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: Uuid, @Req() req: Request): Promise<void> {
    await this.threadService.softDelete(id, req['user'].id as Uuid);
  }
}
