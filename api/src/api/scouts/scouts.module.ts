import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScoutsController } from './scouts.controller';
import { ScoutsService } from './scouts.service';
import {
    ScoutCandidateEntity,
    YouthPlayerEntity,
    YouthTeamEntity,
    PlayerEntity,
    TeamEntity,
} from '@goalxi/database';
import { AuthModule } from '../auth/auth.module';

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
