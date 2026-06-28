import {
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateThreadReqDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'forum.error.title_too_short' })
  @MaxLength(200, { message: 'forum.error.title_too_long' })
  title: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'forum.error.body_too_short' })
  @MaxLength(10000, { message: 'forum.error.body_too_long' })
  body: string;

  @IsUUID()
  categoryId: string;
}
