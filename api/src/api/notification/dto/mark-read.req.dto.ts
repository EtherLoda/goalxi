import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';

/**
 * Body for `POST /v1/notifications/read`.
 *
 * Two valid shapes:
 *   - `{ ids: ["uuid", ...] }` → mark each id as read (deletes from inbox)
 *   - `{}` or `{ ids: [] }` → mark **all** as read (clears inbox)
 *
 * The 200-cap on array size prevents a client from accidentally
 * or maliciously sending an unbounded payload; if they really have
 * > 200 items they should hit `DELETE /v1/notifications` instead.
 */
export class MarkReadReqDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  @Type(() => String)
  ids?: string[];
}
