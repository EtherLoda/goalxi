import {
  ClassSerializerInterceptor,
  HttpStatus,
  RequestMethod,
  UnprocessableEntityException,
  ValidationError,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import compression from 'compression';
import helmet from 'helmet';
import { AuthService } from './api/auth/auth.service';
import { AppModule } from './app.module';
import { PinoLoggerService } from './common/PinoLoggerService';
import { type AllConfigType } from './config/config.type';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { AuthGuard } from './guards/auth.guard';
import setupSwagger from './utils/setup-swagger';

const logger = new PinoLoggerService({
  file: './logs/api.log',
  maxSize: 100 * 1024 * 1024, // 100MB
  maxFiles: 7,
  level: 'warn',
  service: 'api',
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(logger);

  // Setup security headers
  app.use(helmet());

  // For high-traffic websites in production, it is strongly recommended to offload compression from the application server - typically in a reverse proxy (e.g., Nginx). In that case, you should not use compression middleware.
  app.use(compression());

  const configService = app.get(ConfigService<AllConfigType>);
  const reflector = app.get(Reflector);
  const isDevelopment =
    configService.getOrThrow('app.nodeEnv', { infer: true }) === 'development';
  const corsOrigin = configService.getOrThrow('app.corsOrigin', {
    infer: true,
  });

  // app.enableCors({
  //   origin: corsOrigin,
  //   methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  //   allowedHeaders: 'Content-Type, Accept',
  //   credentials: true,
  // });
  app.enableCors({
    origin: corsOrigin, // 确保这里的 corsOrigin 是一个数组（见下文）
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS', // 建议加上 OPTIONS
    allowedHeaders: 'Content-Type, Accept, Authorization', // 加上 Authorization
    credentials: true,
  });
  logger.warn(`CORS Origin: ${corsOrigin}`);

  // Use global prefix if you don't have subdomain
  app.setGlobalPrefix(
    configService.getOrThrow('app.apiPrefix', { infer: true }),
    {
      exclude: [
        { method: RequestMethod.GET, path: '/' },
        { method: RequestMethod.GET, path: 'health' },
      ],
    },
  );

  app.enableVersioning({
    type: VersioningType.URI,
  });

  app.useGlobalGuards(new AuthGuard(reflector, app.get(AuthService)));
  app.useGlobalFilters(new GlobalExceptionFilter(configService));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      exceptionFactory: (errors: ValidationError[]) => {
        return new UnprocessableEntityException(errors);
      },
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(reflector));

  if (isDevelopment) {
    setupSwagger(app);
  }

  await app.listen(configService.getOrThrow('app.port', { infer: true }));

  logger.info(`Server running on ${await app.getUrl()}`);

  return app;
}

void bootstrap();
