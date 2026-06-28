import { Expose, Type } from 'class-transformer';

export class ReactionUserRefDto {
  @Expose()
  id: string;

  @Expose()
  username: string | null;
}

export class ReactionSummaryResDto {
  @Expose()
  count: number;

  @Expose()
  hasReacted: boolean;
}

export class ReactionListResDto {
  @Expose()
  @Type(() => ReactionUserRefDto)
  users: ReactionUserRefDto[];

  @Expose()
  count: number;
}
