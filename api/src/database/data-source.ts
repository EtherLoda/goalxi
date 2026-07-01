import {
  AuctionEntity,
  FanEntity,
  FinanceEntity,
  ForumCategoryEntity,
  ForumPostEntity,
  ForumReactionEntity,
  ForumThreadEntity,
  LeagueEntity,
  LeagueStandingEntity,
  MatchEntity,
  MatchTeamStatsEntity,
  PlayerEntity,
  PlayerEventEntity,
  PlayerTransactionEntity,
  SeasonResultEntity,
  SessionEntity,
  StadiumConstructionEntity,
  StadiumEntity,
  StaffEntity,
  TacticsPresetEntity,
  TeamEntity,
  TransactionEntity,
  UserEntity,
  YouthLeagueEntity,
  YouthTeamEntity,
} from '@goalxi/database';
import 'reflect-metadata';
import { DataSource } from 'typeorm';

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
    StaffEntity,
    TeamEntity,
    LeagueEntity,
    MatchEntity,
    TacticsPresetEntity,
    MatchTeamStatsEntity,
    SeasonResultEntity,
    LeagueStandingEntity,
    FinanceEntity,
    PlayerEntity,
    TransactionEntity,
    AuctionEntity,
    PlayerEventEntity,
    PlayerTransactionEntity,
    StadiumEntity,
    StadiumConstructionEntity,
    FanEntity,
    YouthLeagueEntity,
    YouthTeamEntity,
    ForumCategoryEntity,
    ForumThreadEntity,
    ForumPostEntity,
    ForumReactionEntity,
  ],
  // Exclude `*.spec.ts` / `*.spec.js` so Jest tripwire specs that live next
  // to migrations (see 1722000000000-UnifyYouthIntoPlayer.spec.ts) are not
  // loaded as migrations. Without the negation, the glob would also match
  // spec files and TypeORM would evaluate `describe(...)` at import time,
  // which throws `ReferenceError: describe is not defined` outside Jest.
  migrations: [
    'src/database/migrations/**/!(*.spec).{ts,js}',
    '../libs/database/src/migrations/**/!(*.spec).{ts,js}',
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
