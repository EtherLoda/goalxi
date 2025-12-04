import 'reflect-metadata';
import { DataSource } from 'typeorm';
import type { SeederOptions } from 'typeorm-extension';
import {
  UserEntity,
  SessionEntity,
  TeamEntity,
  LeagueEntity,
  MatchEntity,
  SeasonResultEntity,
  LeagueStandingEntity,
  FinanceEntity,
  PlayerEntity,
  TransactionEntity,
  AuctionEntity,
  PlayerHistoryEntity,
  PlayerTransactionEntity,
} from '@goalxi/database';

export const AppDataSource = new DataSource({
  type: process.env.DATABASE_TYPE,
  url: process.env.DATABASE_URL,
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT
    ? parseInt(process.env.DATABASE_PORT, 10)
    : 5432,
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  synchronize: process.env.DATABASE_SYNCHRONIZE === 'true',
  dropSchema: false,
  keepConnectionAlive: true,
  logging: process.env.NODE_ENV !== 'production',
  entities: [
    UserEntity,
    SessionEntity,
    TeamEntity,
    LeagueEntity,
    MatchEntity,
    SeasonResultEntity,
    LeagueStandingEntity,
    FinanceEntity,
    PlayerEntity,
    TransactionEntity,
    AuctionEntity,
    PlayerHistoryEntity,
    PlayerTransactionEntity,
  ],
  migrations: [
    'src/database/migrations/**/*{.ts,.js}',
    '../libs/database/src/migrations/**/*{.ts,.js}',
  ],
  migrationsTableName: 'migrations',
  poolSize: process.env.DATABASE_MAX_CONNECTIONS
    ? parseInt(process.env.DATABASE_MAX_CONNECTIONS, 10)
    : 100,
  ssl:
    process.env.DATABASE_SSL_ENABLED === 'true'
      ? {
        rejectUnauthorized:
          process.env.DATABASE_REJECT_UNAUTHORIZED === 'true',
        ca: process.env.DATABASE_CA ?? undefined,
        key: process.env.DATABASE_KEY ?? undefined,
        cert: process.env.DATABASE_CERT ?? undefined,
      }
      : undefined,
  seeds: ['src/database/seeds/**/*{.ts,.js}'],
  seedTracking: true,
  factories: ['src/database/factories/**/*{.ts,.js}'],
} as any);
