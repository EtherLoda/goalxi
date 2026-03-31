import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlayerEntity, StaffEntity, TeamEntity } from '@goalxi/database';
import { TrainingProcessor } from './processors/training.processor';

@Module({
    imports: [
        BullModule.registerQueue({
            name: 'training-settlement',
        }),
        TypeOrmModule.forFeature([PlayerEntity, StaffEntity, TeamEntity]),
    ],
    providers: [TrainingProcessor],
    exports: [BullModule],
})
export class TrainingModule {}
