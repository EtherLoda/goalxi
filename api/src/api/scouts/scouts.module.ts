import {
  PlayerEntity,
  ScoutCandidateEntity,
  TeamEntity,
  YouthPlayerEntity,
  YouthTeamEntity,
} from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ScoutsController } from './scouts.controller';
import { ScoutsService } from './scouts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ScoutCandidateEntity,
      YouthPlayerEntity,
      YouthTeamEntity,
      PlayerEntity,
      TeamEntity,
    ]),
    AuthModule,
  ],
  controllers: [ScoutsController],
  providers: [ScoutsService],
  exports: [ScoutsService],
})
export class ScoutsModule {}
