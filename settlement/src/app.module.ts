import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConfigService } from './config/database.config';
import { TrainingModule } from './training.module';
import { FanModule } from './fan.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['.env'],
        }),
        BullModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                connection: {
                    host: configService.getOrThrow('REDIS_HOST', { infer: true }),
                    port: configService.getOrThrow<number>('REDIS_PORT', { infer: true }),
                    password: configService.getOrThrow('REDIS_PASSWORD', { infer: true }),
                },
            }),
            inject: [ConfigService],
        }),
        TypeOrmModule.forRootAsync({
            useClass: DatabaseConfigService,
        }),
        TrainingModule,
        FanModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}
