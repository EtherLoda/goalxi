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
    ],
    controllers: [YouthMatchController],
    providers: [YouthMatchService],
    exports: [YouthMatchService],
})
export class YouthMatchModule {}
