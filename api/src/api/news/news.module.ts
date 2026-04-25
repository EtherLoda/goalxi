import { AuthModule } from '@/api/auth/auth.module';
import { TeamEntity, TransferTransactionEntity } from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransferTransactionEntity, TeamEntity]),
    AuthModule,
  ],
  controllers: [NewsController],
  providers: [NewsService],
  exports: [NewsService],
})
export class NewsModule {}
