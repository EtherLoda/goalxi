import { FanEntity } from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FanController } from './fan.controller';
import { FanService } from './fan.service';

@Module({
  imports: [TypeOrmModule.forFeature([FanEntity])],
  controllers: [FanController],
  providers: [FanService],
  exports: [FanService],
})
export class FanModule {}
