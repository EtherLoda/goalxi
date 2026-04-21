import { Uuid } from '@/common/types/common.type';
import { CurrentUser } from '@/decorators/current-user.decorator';
import { AuthGuard } from '@/guards/auth.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  NotificationRedisService,
  NotificationType,
} from './notification-redis.service';

class ListQueryDto {
  page: number = 1;
  limit: number = 20;
}

class MarkReadDto {
  ids?: string[];
}

@Controller({ path: 'notifications', version: '1' })
@UseGuards(AuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationRedisService) {}

  @Get()
  async list(@CurrentUser('id') userId: Uuid, @Query() query: ListQueryDto) {
    const { page, limit } = query;
    const result = await this.notificationService.getInbox(userId, page, limit);
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

  @Post('read')
  async markRead(@CurrentUser('id') userId: Uuid, @Body() dto: MarkReadDto) {
    const markedCount = await this.notificationService.markAsRead(
      userId,
      dto.ids,
    );
    return { markedCount };
  }

  @Delete()
  async deleteRead(@CurrentUser('id') userId: Uuid) {
    const deletedCount = await this.notificationService.deleteRead(userId);
    return { deletedCount };
  }

  // 全局通知接口（仅管理员/系统使用）
  @Post('global')
  async createGlobalBroadcast(
    @Body()
    body: {
      type: NotificationType;
      messageKey: string;
      data: Record<string, any>;
    },
  ) {
    const id = await this.notificationService.createGlobalBroadcast(
      body.type,
      body.messageKey,
      body.data,
    );
    return { id };
  }

  @Get('global')
  async getGlobalNotifications(
    @CurrentUser('id') userId: Uuid,
    @Query('since') since?: string,
  ) {
    const sinceTimestamp = since ? parseInt(since, 10) : 0;
    const notifications =
      await this.notificationService.getGlobalNotificationsSince(
        userId,
        sinceTimestamp,
      );
    return { items: notifications };
  }
}
