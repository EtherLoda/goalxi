import { ForumCategoryEntity, ForumThreadEntity } from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ForumThreadController } from './controllers/forum-thread.controller';
import { ForumThreadService } from './services/forum-thread.service';

@Module({
  imports: [TypeOrmModule.forFeature([ForumThreadEntity, ForumCategoryEntity])],
  controllers: [ForumThreadController],
  providers: [ForumThreadService],
  exports: [ForumThreadService],
})
export class ForumThreadModule {}
