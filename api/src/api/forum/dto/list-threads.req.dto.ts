import { PageOptionsDto } from '@/common/dto/offset-pagination/page-options.dto';
import { ForumThreadSort } from '@goalxi/database';
import { IsEnum, IsOptional } from 'class-validator';

export class ListThreadsReqDto extends PageOptionsDto {
  @IsOptional()
  @IsEnum(ForumThreadSort, { message: 'forum.error.invalid_slug' })
  sort?: ForumThreadSort = ForumThreadSort.LATEST;
}
