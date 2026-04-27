import { PageOptionsDto } from '@/common/dto/offset-pagination/page-options.dto';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ListPlayerReqDto extends PageOptionsDto {
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  detailed?: boolean;
}
