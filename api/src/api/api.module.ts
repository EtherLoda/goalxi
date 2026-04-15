import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { FanModule } from './fan/fan.module';
import { FinanceModule } from './finance/finance.module';
import { GameModule } from './game/game.module';
import { InjuryModule } from './injury/injury.module';
import { LeagueModule } from './league/league.module';
import { MatchModule } from './match/match.module';
import { PlayerEventModule } from './player-event/player-event.module';
import { PlayerModule } from './player/player.module';
import { ScoutsModule } from './scouts/scouts.module';
import { StadiumModule } from './stadium/stadium.module';
import { StaffsModule } from './staffs/staffs.module';
import { StatsModule } from './stats/stats.module';
import { TeamModule } from './team/team.module';
import { TrainingModule } from './training/training.module';
import { TransferModule } from './transfer/transfer.module';
import { UserModule } from './user/user.module';
import { YouthMatchModule } from './youth-match/youth-match.module';
import { YouthModule } from './youth/youth.module';

@Module({
  imports: [
    UserModule,
    AuthModule,
    PlayerModule,
    PlayerEventModule,
    LeagueModule,
    TeamModule,
    FinanceModule,
    TransferModule,
    MatchModule,
    StatsModule,
    InjuryModule,
    YouthModule,
    YouthMatchModule,
    ScoutsModule,
    StaffsModule,
    TrainingModule,
    StadiumModule,
    FanModule,
    GameModule,
  ],
})
export class ApiModule {}
