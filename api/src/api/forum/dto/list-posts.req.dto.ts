import { PageOptionsDto } from '@/common/dto/offset-pagination/page-options.dto';
import { ForumPostSort } from '@goalxi/database';
import { IsEnum, IsOptional } from 'class-validator';

export class ListPostsReqDto extends PageOptionsDto {
  @IsOptional()
  @IsEnum(ForumPostSort, { message: 'forum.error.invalid_slug' })
  sort?: ForumPostSort = ForumPostSort.OLDEST;
}
