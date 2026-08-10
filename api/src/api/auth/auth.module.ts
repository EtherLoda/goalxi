import { UserEntity } from '@goalxi/database';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    UserModule,
    OnboardingModule,
    TypeOrmModule.forFeature([UserEntity]),
    JwtModule.register({}),
    // EmailQueueModule is @Global() (loaded by BackgroundModule),
    // so the typed EmailQueueService is available here without
    // an explicit import. The old `BullModule.registerQueue` block
    // was removed in P1-#16: it registered the same queue with
    // a *different* prefix (auth:), which would have split our
    // own jobs across two Redis keyspaces.
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
