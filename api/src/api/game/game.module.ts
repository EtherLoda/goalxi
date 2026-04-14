import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GameStateService } from './game-state.service';
import { GameController } from './game.controller';

@Module({
  imports: [AuthModule],
  controllers: [GameController],
  providers: [GameStateService],
  exports: [GameStateService],
})
export class GameModule {}
