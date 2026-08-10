import { Uuid } from '@/common/types/common.type';
import { CurrentUser } from '@/decorators/current-user.decorator';
import { Roles } from '@/decorators/roles.decorator';
import { AuthGuard } from '@/guards/auth.guard';
import { RolesGuard } from '@/guards/roles.guard';
import { UserRole } from '@goalxi/database';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GlobalBroadcastReqDto } from './dto/global-broadcast.req.dto';
import { ListNotificationsReqDto } from './dto/list-notifications.req.dto';
import { MarkReadReqDto } from './dto/mark-read.req.dto';
import { NotificationRedisService } from './notification-redis.service';

@Controller({ path: 'notifications', version: '1' })
@UseGuards(AuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationRedisService) {}

  /**
   * List notifications in the caller's inbox, newest first.
   *
   * `total` and `unreadCount` are the same value today because the
   * inbox model is "already-read items are deleted, so anything
   * still in the ZSET is unread". If you ever add an isRead flag,
   * `unreadCount` is the field to compute against.
   */
  @Get()
  async list(
    @CurrentUser('id') userId: Uuid,
    @Query() query: ListNotificationsReqDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const result = await this.notificationService.getInbox(
      userId,
      page,
      limit,
    );
    return {
      items: result.items,
      meta: {
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit),
        unreadCount: result.unreadCount,
      },
    };
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser('id') userId: Uuid) {
    const count = await this.notificationService.getUnreadCount(userId);
    return { count };
  }

  /**
   * Mark notifications as read (= remove from inbox).
   *
   * Behaviour:
   *   - With `ids` → deletes each matching notification
   *   - Without `ids` (empty body) → deletes the entire inbox
   *
   * Previous behaviour returned 0 for empty ids, which made the
   * "mark all as read" button a silent no-op. We now route to
   * `markAllAsRead` so the operation is actually performed.
   */
  @Post('read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @CurrentUser('id') userId: Uuid,
    @Body() dto: MarkReadReqDto,
  ) {
    const ids = dto.ids ?? [];
    const markedCount =
      ids.length === 0
        ? await this.notificationService.markAllAsRead(userId)
        : await this.notificationService.markAsRead(userId, ids);
    return { markedCount };
  }

  /**
   * Clear the entire inbox. Equivalent to `POST /read` with no ids.
   * Kept as a separate verb so REST clients can use the right
   * semantics — DELETE for "discard the whole list".
   */
  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteRead(@CurrentUser('id') userId: Uuid) {
    const deletedCount = await this.notificationService.deleteRead(userId);
    return { deletedCount };
  }

  /**
   * ADMIN-only. Publishes a global broadcast that every connected
   * user can pick up via `GET /global`. See P0-#1: this used to be
   * open to any authenticated user, which is now closed behind
   * `RolesGuard + @Roles(UserRole.ADMIN)`.
   */
  @Post('global')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createGlobalBroadcast(@Body() body: GlobalBroadcastReqDto) {
    const id = await this.notificationService.createGlobalBroadcast(
      body.type,
      body.messageKey,
      body.data ?? {},
    );
    return { id };
  }

  /**
   * Get global broadcasts since the caller's last poll (or since
   * an explicit `since` timestamp for backfill). See P0-#3: a
   * per-user cursor on the server now advances on each poll, so
   * repeated calls without `since` are not duplicates.
   */
  @Get('global')
  async getGlobalNotifications(
    @CurrentUser('id') userId: Uuid,
    @Query('since', new ParseIntPipe({ optional: true })) since?: number,
  ) {
    const notifications =
      await this.notificationService.getGlobalNotificationsSince(
        userId,
        since ?? 0,
      );
    return { items: notifications };
  }
}
