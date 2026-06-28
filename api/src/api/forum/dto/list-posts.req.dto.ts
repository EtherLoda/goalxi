import { ForumPostSort } from '@goalxi/database';
import { IsEnum, IsOptional } from 'class-validator';
import { PageOptionsDto } from '@/common/dto/offset-pagination/page-options.dto';

export class ListPostsReqDto extends PageOptionsDto {
  @IsOptional()
  @IsEnum(ForumPostSort, { message: 'forum.error.invalid_slug' })
  sort?: ForumPostSort = ForumPostSort.OLDEST;
}
