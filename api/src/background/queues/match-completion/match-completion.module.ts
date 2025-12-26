import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
    MatchEntity,
    LeagueStandingEntity,
    PlayerEntity,
    MatchEventEntity,
    MatchTacticsEntity,
} from '@goalxi/database';
import { MatchCompletionProcessor } from './match-completion.processor';
import { MatchCompletionService } from '@/api/match/match-completion.service';
import { MatchCacheService } from '@/api/match/match-cache.service';

@Module({
    imports: [
        BullModule.registerQueue({
            name: 'match-completion',
        }),
        TypeOrmModule.forFeature([
            MatchEntity,
            LeagueStandingEntity,
            PlayerEntity,
            MatchEventEntity,
            MatchTacticsEntity,
        ]),
    ],
    providers: [
        MatchCompletionProcessor,
        MatchCompletionService,
        MatchCacheService,
    ],
    exports: [BullModule],
})
export class MatchCompletionModule { }
