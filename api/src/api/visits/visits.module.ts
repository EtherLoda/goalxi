import { LeagueEntity, TeamEntity, UserEntity } from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VisitsController } from './visits.controller';
import { VisitsRepository } from './visits.repository';
import { VisitsService } from './visits.service';

@Module({
  imports: [TypeOrmModule.forFeature([TeamEntity, LeagueEntity, UserEntity])],
  controllers: [VisitsController],
  providers: [VisitsService, VisitsRepository],
})
export class VisitsModule {}
