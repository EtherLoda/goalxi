import { TransferModule } from './transfer/transfer.module';
import { FinanceModule } from './finance/finance.module';
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { LeagueModule } from './league/league.module';
import { PlayerModule } from './player/player.module';
import { TeamModule } from './team/team.module';
import { UserModule } from './user/user.module';
import { MatchModule } from './match/match.module';

@Module({
  imports: [UserModule, AuthModule, PlayerModule, LeagueModule, TeamModule, FinanceModule, TransferModule, MatchModule],
})
export class ApiModule { }
