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

  /**
   * [RFC 0001] When true, returns only youth players (is_youth = true).
   * Replaces the old /youth-players endpoint which is now removed.
   */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isYouth?: boolean;
}
