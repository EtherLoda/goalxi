import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { VISIT_SUBJECT_TYPES, VisitSubjectType } from '../visit-subject.type';

export class RecordVisitReqDto {
  @ApiProperty({ enum: VISIT_SUBJECT_TYPES })
  @IsIn(VISIT_SUBJECT_TYPES)
  subjectType!: VisitSubjectType;

  @ApiProperty()
  @IsUUID()
  subjectId!: string;
}

export class ListVisitsReqDto {
  @ApiProperty({ enum: VISIT_SUBJECT_TYPES })
  @IsIn(VISIT_SUBJECT_TYPES)
  subjectType!: VisitSubjectType;

  @ApiProperty()
  @IsUUID()
  subjectId!: string;

  /**
   * How many visitors to return. The panel shows 8; the ceiling exists
   * because the query is a `ZREVRANGE` whose cost grows with `limit`.
   */
  @ApiPropertyOptional({ default: 8, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
