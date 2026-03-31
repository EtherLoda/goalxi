import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { YouthController } from './youth.controller';
import { YouthService } from './youth.service';
import { YouthPlayerEntity, PlayerEntity, TeamEntity } from '@goalxi/database';

@Module({
    imports: [
        TypeOrmModule.forFeature([YouthPlayerEntity, PlayerEntity, TeamEntity]),
    ],
    controllers: [YouthController],
    providers: [YouthService],
    exports: [YouthService],
})
export class YouthModule {}
