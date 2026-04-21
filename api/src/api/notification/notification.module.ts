import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationRedisService } from './notification-redis.service';
import { NotificationController } from './notification.controller';

@Module({
  imports: [AuthModule],
  controllers: [NotificationController],
  providers: [NotificationRedisService],
  exports: [NotificationRedisService],
})
export class NotificationModule {}
