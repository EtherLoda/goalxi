import { Expose, Type } from 'class-transformer';

export class AuthorRefResDto {
  @Expose()
  id: string;

  @Expose()
  username: string | null;
}

export class ThreadResDto {
  @Expose()
  id: string;

  @Expose()
  categoryId: string;

  @Expose()
  authorId: string;

  @Expose()
  @Type(() => AuthorRefResDto)
  author: AuthorRefResDto | null;

  @Expose()
  title: string;

  @Expose()
  body: string;

  @Expose()
  isPinned: boolean;

  @Expose()
  replyCount: number;

  @Expose()
  @Type(() => Date)
  lastReplyAt: Date | null;

  @Expose()
  lastReplyUserId: string | null;

  @Expose()
  @Type(() => AuthorRefResDto)
  lastReplyUser: AuthorRefResDto | null;

  @Expose()
  hotScore: number;

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;
}
