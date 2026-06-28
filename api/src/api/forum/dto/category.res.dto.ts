import { Expose, Type } from 'class-transformer';

export class CategoryResDto {
  @Expose()
  id: string;

  @Expose()
  slug: string;

  @Expose()
  name: string;

  @Expose()
  description: string | null;

  @Expose()
  threadCount: number;

  @Expose()
  postCount: number;

  @Expose()
  isActive: boolean;

  @Expose()
  @Type(() => Date)
  createdAt: Date;
}
