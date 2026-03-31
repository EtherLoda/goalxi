import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaffsController } from './staffs.controller';
import { StaffsService } from './staffs.service';
import { StaffEntity, TeamEntity, FinanceEntity } from '@goalxi/database';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([StaffEntity, TeamEntity, FinanceEntity]),
        AuthModule,
    ],
    controllers: [StaffsController],
    providers: [StaffsService],
    exports: [StaffsService],
})
export class StaffsModule {}
