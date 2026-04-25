import {
  DateField,
  EnumField,
  NumberField,
  StringField,
  UUIDField,
} from '@/decorators/field.decorators';
import { AnnouncementType } from '@goalxi/database';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class AnnouncementResDto {
  @UUIDField()
  @Expose()
  id: string;

  @StringField()
  @Expose()
  title: string;

  @StringField()
  @Expose()
  content: string;

  @EnumField(() => AnnouncementType)
  @Expose()
  type: AnnouncementType;

  @NumberField()
  @Expose()
  priority: number;

  @DateField()
  @Expose()
  createdAt: Date;
}

export class AnnouncementListResDto {
  @Expose()
  items: AnnouncementResDto[];

  @Expose()
  total: number;
}
