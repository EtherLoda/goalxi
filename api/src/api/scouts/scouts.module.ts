import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScoutsController } from './scouts.controller';
import { ScoutsService } from './scouts.service';
import {
    ScoutCandidateEntity,
    YouthPlayerEntity,
    PlayerEntity,
    TeamEntity,
} from '@goalxi/database';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ScoutCandidateEntity,
            YouthPlayerEntity,
            PlayerEntity,
            TeamEntity,
        ]),
    ],
    controllers: [ScoutsController],
    providers: [ScoutsService],
    exports: [ScoutsService],
})
export class ScoutsModule {}
