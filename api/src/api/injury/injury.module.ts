import {
  InjuryEntity,
  MatchEntity,
  PlayerEntity,
  StaffEntity,
  TeamEntity,
} from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InjuryController } from './injury.controller';
import { InjuryService } from './injury.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InjuryEntity,
      PlayerEntity,
      StaffEntity,
      MatchEntity,
      // [P1-#4] TeamEntity registered here so `InjuryService` can
      // resolve `@InjectRepository(TeamEntity)` for the team-ownership
      // guard on every controller endpoint.
      TeamEntity,
    ]),
  ],
  controllers: [InjuryController],
  providers: [InjuryService],
  exports: [InjuryService],
})
export class InjuryModule {}
