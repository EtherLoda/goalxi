import { TeamAuditController } from './club-audit.controller';
import { ClubAuditService } from './club-audit.service';
import { Module } from '@nestjs/common';
import { TeamEntity, TransactionEntity } from '@goalxi/database';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [TypeOrmModule.forFeature([TeamEntity, TransactionEntity])],
    controllers: [TeamAuditController],
    providers: [ClubAuditService],
    exports: [ClubAuditService],
})
export class ClubAuditModule {}
