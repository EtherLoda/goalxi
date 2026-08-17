import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { KNOWN_NOTIFICATION_MESSAGE_KEYS } from '../notification-message-key';
import { NotificationType } from '../notification-redis.service';

/**
 * Body for `POST /v1/notifications/global` (ADMIN only).
 *
 * `messageKey` is the i18n key the client will resolve against its
 * own message bundle. The runtime check is `IsString` + length-capped
 * — admins occasionally need to push a key that the API's
 * `NotificationMessageKey` union doesn't know about yet, and forcing
 * them to redeploy the API to ship a one-off announcement is silly.
 * For producer-side code (auction.service etc.) we type the key
 * against the union so typos break the build.
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
  messageKey!: (typeof KNOWN_NOTIFICATION_MESSAGE_KEYS)[number] | (string & {});

  @IsObject()
  @IsOptional()
  data?: Record<string, unknown>;
}
