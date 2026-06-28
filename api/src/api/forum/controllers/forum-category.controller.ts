import { Public } from '@/decorators/public.decorator';
import { Controller, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CategoryResDto } from '../dto/category.res.dto';
import { ForumCategoryService } from '../services/forum-category.service';

@ApiTags('Forum')
@Controller({
  path: 'forum/categories',
  version: '1',
})
export class ForumCategoryController {
  constructor(private readonly categoryService: ForumCategoryService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async list(): Promise<CategoryResDto[]> {
    return this.categoryService.listActive();
  }

  @Public()
  @Get(':slug')
  @HttpCode(HttpStatus.OK)
  async getBySlug(@Param('slug') slug: string): Promise<CategoryResDto | null> {
    return this.categoryService.getBySlug(slug);
  }
}
