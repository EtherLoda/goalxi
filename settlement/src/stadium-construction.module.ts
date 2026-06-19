import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MatchEntity,
  StadiumConstructionEntity,
  StadiumEntity,
  TeamEntity,
} from '@goalxi/database';
import { NotificationModule } from './notification/notification.module';
import { StadiumConstructionProcessor } from './processors/stadium-construction.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'construction-settlement',
    }),
    TypeOrmModule.forFeature([
      StadiumConstructionEntity,
      StadiumEntity,
      TeamEntity,
      MatchEntity,
    ]),
    NotificationModule,
  ],
  providers: [StadiumConstructionProcessor],
  exports: [BullModule],
})
export class StadiumConstructionModule {}
