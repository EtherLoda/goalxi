import { InjuryEntity, PlayerEntity } from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InjuryController } from './injury.controller';
import { InjuryService } from './injury.service';

@Module({
  imports: [TypeOrmModule.forFeature([InjuryEntity, PlayerEntity])],
  controllers: [InjuryController],
  providers: [InjuryService],
  exports: [InjuryService],
})
export class InjuryModule {}
