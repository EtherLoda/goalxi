import { ForumPostEntity, ForumReactionEntity } from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ForumReactionController } from './controllers/forum-reaction.controller';
import { ForumReactionService } from './services/forum-reaction.service';

@Module({
  imports: [TypeOrmModule.forFeature([ForumReactionEntity, ForumPostEntity])],
  controllers: [ForumReactionController],
  providers: [ForumReactionService],
  exports: [ForumReactionService],
})
export class ForumReactionModule {}
