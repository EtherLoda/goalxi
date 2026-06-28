import { ForumCategoryEntity } from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ForumCategoryController } from './controllers/forum-category.controller';
import { ForumCategoryService } from './services/forum-category.service';

@Module({
  imports: [TypeOrmModule.forFeature([ForumCategoryEntity])],
  controllers: [ForumCategoryController],
  providers: [ForumCategoryService],
  exports: [ForumCategoryService],
})
export class ForumCategoryModule {}
