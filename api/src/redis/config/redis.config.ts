import { registerAs } from '@nestjs/config';

import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { RedisConfig } from './redis-config.type';

class EnvironmentVariablesValidator {
  @IsString()
  @IsNotEmpty()
  REDIS_HOST: string;

  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  REDIS_PORT: number;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD: string;

  @IsBoolean()
  @IsOptional()
  REDIS_TLS_ENABLED: boolean;

  @IsInt()
  @Min(0)
  @Max(15)
  @IsOptional()
  // P2-#31: logical Redis DB number. Single-instance Redis caps
  // at 16 DBs (0-15) by default. Cluster has no DB concept — this
  // value is ignored on cluster setups.
  REDIS_DB: number;
}

export default registerAs<RedisConfig>('redis', () => {
  console.info(`Register RedisConfig from environment variables`);
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
    password: process.env.REDIS_PASSWORD,
    tlsEnabled: process.env.REDIS_TLS_ENABLED === 'true',
    db: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : 0,
  };
});
