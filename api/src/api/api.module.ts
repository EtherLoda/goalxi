import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { FinanceModule } from './finance/finance.module';
import { LeagueModule } from './league/league.module';
import { MatchModule } from './match/match.module';
import { PlayerModule } from './player/player.module';
import { TeamModule } from './team/team.module';
import { TransferModule } from './transfer/transfer.module';
import { UserModule } from './user/user.module';
import { SchedulerModule } from '../scheduler/scheduler.module';

@Module({
  imports: [
    UserModule,
    AuthModule,
    PlayerModule,
    LeagueModule,
    TeamModule,
    FinanceModule,
    TransferModule,
    MatchModule,
    SchedulerModule,
  ],
})
export class ApiModule { }
