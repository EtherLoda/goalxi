import { TeamEntity, TransactionEntity } from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamAuditController } from './club-audit.controller';
import { ClubAuditService } from './club-audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([TeamEntity, TransactionEntity])],
  controllers: [TeamAuditController],
  providers: [ClubAuditService],
  exports: [ClubAuditService],
})
export class ClubAuditModule {}
