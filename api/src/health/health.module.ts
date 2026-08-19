import { Global, Module } from '@nestjs/common';
import { HealthProbeService } from './health-probe.service';
import { HealthStateService } from './health-state.service';
import { HealthController } from './health.controller';
import { ReadinessGuard } from './readiness.guard';

/**
 * Global health module: provides `/health` (K8s readiness),
 * a periodic DB+Redis probe, and the global `ReadinessGuard` that
 * fail-fasts with 503 when the DB dependency is failing.
 *
 * `@Global()` so `ReadinessGuard` can be resolved by `app.useGlobalGuards`
 * in `main.ts` without each route importing it.
 */
@Global()
@Module({
  controllers: [HealthController],
  providers: [HealthStateService, HealthProbeService, ReadinessGuard],
  exports: [HealthStateService, ReadinessGuard],
})
export class HealthModule {}
