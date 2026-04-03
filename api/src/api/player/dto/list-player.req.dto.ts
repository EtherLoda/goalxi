import { PageOptionsDto } from '@/common/dto/offset-pagination/page-options.dto';
import { IsOptional, IsUUID } from 'class-validator';

export class ListPlayerReqDto extends PageOptionsDto {
  @IsOptional()
  @IsUUID()
  teamId?: string;
}
