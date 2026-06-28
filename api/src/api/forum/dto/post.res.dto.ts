import { Expose, Type } from 'class-transformer';
import { AuthorRefResDto } from './thread.res.dto';

export class PostResDto {
  @Expose()
  id: string;

  @Expose()
  threadId: string;

  @Expose()
  authorId: string;

  @Expose()
  @Type(() => AuthorRefResDto)
  author: AuthorRefResDto | null;

  @Expose()
  body: string;

  @Expose()
  reactionCount: number;

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;
}
