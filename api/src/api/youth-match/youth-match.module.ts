import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
    YouthMatchEntity,
    YouthMatchTacticsEntity,
    YouthMatchEventEntity,
    YouthTeamEntity,
    YouthPlayerEntity,
    TeamEntity,
} from '@goalxi/database';
import { YouthMatchController } from './youth-match.controller';
import { YouthMatchService } from './youth-match.service';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            YouthMatchEntity,
            YouthMatchTacticsEntity,
            YouthMatchEventEntity,
            YouthTeamEntity,
            YouthPlayerEntity,
            TeamEntity,
        ]),
        AuthModule,
    ],
    controllers: [YouthMatchController],
    providers: [YouthMatchService],
    exports: [YouthMatchService],
})
export class YouthMatchModule {}
