import {
  TeamEntity,
  YouthMatchEntity,
  YouthMatchEventEntity,
  YouthMatchTacticsEntity,
  YouthPlayerEntity,
  YouthTeamEntity,
} from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { YouthMatchController } from './youth-match.controller';
import { YouthMatchService } from './youth-match.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      YouthMatchEntity,
      YouthMatchTacticsEntity,
      YouthMatchEventEntity,
      YouthTeamEntity,
      YouthPlayerEntity,
      TeamEntity,
    ]),
    AuthModule,
  ],
  controllers: [YouthMatchController],
  providers: [YouthMatchService],
  exports: [YouthMatchService],
})
export class YouthMatchModule {}
