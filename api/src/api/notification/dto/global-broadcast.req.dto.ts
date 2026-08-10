import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { NotificationType } from '../notification-redis.service';

/**
 * Body for `POST /v1/notifications/global` (ADMIN only).
 *
 * `messageKey` is the i18n key the client will resolve against its
 * own message bundle. We keep it as a free-form string here so
 * adding a new key does not require redeploying the API; the client
 * owns the catalogue. Length cap guards against abuse.
 *
 * `data` is a free-form bag the message template may interpolate.
 * We intentionally do not type its shape — translations own the
 * variable names. Capped indirectly by NestJS body size limits.
 */
export class GlobalBroadcastReqDto {
  @IsEnum(NotificationType)
  type!: NotificationType;

  @IsString()
  @MaxLength(128)
  messageKey!: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, unknown>;
}
