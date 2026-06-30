import {
  PlayerEntity,
  ScoutCandidateEntity,
  TeamEntity,
  YouthLeagueEntity,
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
      PlayerEntity,
      YouthTeamEntity,
      TeamEntity,
      YouthLeagueEntity,
    ]),
    AuthModule,
  ],
  controllers: [ScoutsController],
  providers: [ScoutsService],
  exports: [ScoutsService],
})
export class ScoutsModule {}