import {
  ForumCategoryEntity,
  ForumPostEntity,
  ForumReactionEntity,
  ForumThreadEntity,
} from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ForumPostController } from './controllers/forum-post.controller';
import { ForumThreadModule } from './forum-thread.module';
import { ForumPostService } from './services/forum-post.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ForumPostEntity,
      ForumReactionEntity,
      ForumThreadEntity,
      ForumCategoryEntity,
    ]),
    ForumThreadModule,
  ],
  controllers: [ForumPostController],
  providers: [ForumPostService],
  exports: [ForumPostService],
})
export class ForumPostModule {}
