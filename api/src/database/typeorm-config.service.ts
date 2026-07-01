import TypeOrmCustomLogger from '@/utils/typeorm-custom-logger';
import {
  AuctionEntity,
  FinanceEntity,
  ForumCategoryEntity,
  ForumPostEntity,
  ForumReactionEntity,
  ForumThreadEntity,
  LeagueEntity,
  LeagueStandingEntity,
  MatchEntity,
  MatchEventEntity,
  MatchTacticsEntity,
  MatchTeamStatsEntity,
  PlayerEntity,
  PlayerEventEntity,
  PlayerTransactionEntity,
  SeasonResultEntity,
  SessionEntity,
  TacticsPresetEntity,
  TeamEntity,
  TransactionEntity,
  UserEntity,
} from '@goalxi/database';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { AllConfigType } from '../config/config.type';

@Injectable()
export class TypeOrmConfigService implements TypeOrmOptionsFactory {
  constructor(private configService: ConfigService<AllConfigType>) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      type: this.configService.get('database.type', { infer: true }),
      host: this.configService.get('database.host', { infer: true }),
      port: this.configService.get('database.port', { infer: true }),
      username: this.configService.get('database.username', { infer: true }),
      password: this.configService.get('database.password', { infer: true }),
      database: this.configService.get('database.name', { infer: true }),
      synchronize: this.configService.get('database.synchronize', {
        infer: true,
      }),
      dropSchema: false,
      keepConnectionAlive: true,
      autoLoadEntities: true,
      logger: TypeOrmCustomLogger.getInstance(
        'default',
        this.configService.get('database.logging', { infer: true })
          ? ['error', 'warn', 'query', 'schema']
          : ['error', 'warn'],
      ),
      entities: [
        __dirname + '/../**/*.entity{.ts,.js}',
        UserEntity,
        SessionEntity,
        TeamEntity,
        LeagueEntity,
        MatchEntity,
        MatchTacticsEntity,
        TacticsPresetEntity,
        MatchEventEntity,
        MatchTeamStatsEntity,
        SeasonResultEntity,
        LeagueStandingEntity,
        FinanceEntity,
        PlayerEntity,
        TransactionEntity,
        AuctionEntity,
        PlayerEventEntity,
        PlayerTransactionEntity,
        ForumCategoryEntity,
        ForumThreadEntity,
        ForumPostEntity,
        ForumReactionEntity,
      ],
      // Exclude `*.spec.ts` / `*.spec.js` so Jest tripwire specs that
      // live next to migrations (see 1722000000000-UnifyYouthIntoPlayer
      // .spec.ts) are not loaded as migrations at NestJS bootstrap.
      // Without the negation, the glob also matches spec files and
      // TypeORM evaluates `describe(...)` at import time, throwing
      // `ReferenceError: describe is not defined` outside Jest.
      migrations: [__dirname + '/migrations/**/!(*.spec).{ts,js}'],
      migrationsTableName: 'migrations',
      poolSize: this.configService.get('database.maxConnections', {
        infer: true,
      }),
      ssl: this.configService.get('database.sslEnabled', { infer: true })
        ? {
            rejectUnauthorized: this.configService.get(
              'database.rejectUnauthorized',
              { infer: true },
            ),
            ca:
              this.configService.get('database.ca', { infer: true }) ??
              undefined,
            key:
              this.configService.get('database.key', { infer: true }) ??
              undefined,
            cert:
              this.configService.get('database.cert', { infer: true }) ??
              undefined,
          }
        : undefined,
    } as TypeOrmModuleOptions;
  }
}
