import { Module, type ModuleMetadata } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import generateModulesSet from './utils/modules-set';

const buildImports = async (): Promise<ModuleMetadata['imports']> =>
  generateModulesSet();

@Module({
  imports: await buildImports(),
  providers: [
    {
      // APP_INTERCEPTOR token: NestJS applies this interceptor to every
      // controller route across all feature modules. We do not need to
      // touch any of the 26 existing controllers.
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}