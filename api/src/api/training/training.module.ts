import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';
import { StaffsModule } from '../staffs/staffs.module';
import { PlayerEntity, StaffEntity, TeamEntity } from '@goalxi/database';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([PlayerEntity, StaffEntity, TeamEntity]),
        StaffsModule,
        AuthModule,
    ],
    controllers: [TrainingController],
    providers: [TrainingService],
    exports: [TrainingService],
})
export class TrainingModule {}
