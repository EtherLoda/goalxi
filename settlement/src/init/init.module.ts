import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BootstrapModule } from '../bootstrap/bootstrap.module';
import { InitService } from './init.service';

/**
 * Wires `InitService` for the settlement service. The CLI
 * (`scripts/init.ts`) bypasses the Nest container and
 * hand-rolls the service's collaborators from a raw
 * `DataSource`, so this module exists for the
 * `app.get(InitService)` use case rather than for the
 * CLI itself.
 *
 * Re-exports `BootstrapModule` so the consumer can
 * `imports: [InitModule]` and have access to the
 * individual generators (e.g. to call them from a custom
 * orchestration script).
 */
@Module({
  imports: [TypeOrmModule.forFeature([]), BootstrapModule],
  providers: [InitService],
  exports: [InitService],
})
export class InitModule {}
