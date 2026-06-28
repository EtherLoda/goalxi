import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePostReqDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'forum.error.body_too_short' })
  @MaxLength(10000, { message: 'forum.error.body_too_long' })
  body: string;
}
