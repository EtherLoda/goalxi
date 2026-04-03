import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm';

@Injectable()
export class DatabaseConfigService implements TypeOrmOptionsFactory {
  constructor(private configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      type: 'postgres',
      host: this.configService.getOrThrow('DB_HOST', { infer: true }),
      port: this.configService.getOrThrow<number>('DB_PORT', { infer: true }),
      username: this.configService.getOrThrow('DB_USERNAME', { infer: true }),
      password: this.configService.getOrThrow('DB_PASSWORD', { infer: true }),
      database: this.configService.getOrThrow('DB_DATABASE', { infer: true }),
      entities: ['**/*.entity{.ts,.js}'],
      autoLoadEntities: true,
      synchronize: false,
    };
  }
}
