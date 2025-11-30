import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlayerEntity } from '@goalxi/database';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({
    imports: [TypeOrmModule.forFeature([PlayerEntity])],
    controllers: [PlayerController],
    providers: [PlayerService],
    exports: [PlayerService],
})
export class PlayerModule { }
