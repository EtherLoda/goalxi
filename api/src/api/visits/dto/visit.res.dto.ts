import { ApiProperty } from '@nestjs/swagger';

/**
 * One row of the 最近访客 panel.
 *
 * Nothing here is private: the plan's D2 makes the visitor list public,
 * so the shape is name + picture + timestamp and nothing else. No email,
 * no timezone, no role, no club finances.
 */
export class VisitorDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ description: 'nickname, falling back to username' })
  displayName!: string;

  @ApiProperty({ nullable: true, type: String })
  avatarUrl!: string | null;

  @ApiProperty({ description: 'ISO timestamp of the most recent visit' })
  lastVisitAt!: string;
}

export class VisitListResDto {
  @ApiProperty({ description: 'distinct visitors since 00:00 UTC today' })
  todayCount!: number;

  @ApiProperty({ type: [VisitorDto] })
  visitors!: VisitorDto[];
}
