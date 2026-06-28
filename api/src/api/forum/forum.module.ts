import { Module } from '@nestjs/common';
import { ForumCategoryModule } from './forum-category.module';
import { ForumPostModule } from './forum-post.module';
import { ForumReactionModule } from './forum-reaction.module';
import { ForumThreadModule } from './forum-thread.module';

@Module({
  imports: [
    ForumCategoryModule,
    ForumThreadModule,
    ForumPostModule,
    ForumReactionModule,
  ],
})
export class ForumModule {}
