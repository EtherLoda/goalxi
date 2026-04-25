import { AuthModule } from '@/api/auth/auth.module';
import { AnnouncementEntity } from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnnouncementController } from './announcement.controller';
import { AnnouncementService } from './announcement.service';

@Module({
  imports: [TypeOrmModule.forFeature([AnnouncementEntity]), AuthModule],
  controllers: [AnnouncementController],
  providers: [AnnouncementService],
  exports: [AnnouncementService],
})
export class AnnouncementModule {}
