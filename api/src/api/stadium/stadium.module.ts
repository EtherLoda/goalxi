import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StadiumController } from './stadium.controller';
import { StadiumService } from './stadium.service';
import { StadiumEntity } from '@goalxi/database';

@Module({
    imports: [TypeOrmModule.forFeature([StadiumEntity])],
    controllers: [StadiumController],
    providers: [StadiumService],
    exports: [StadiumService],
})
export class StadiumModule {}
