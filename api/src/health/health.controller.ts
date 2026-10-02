import { Public } from '@/decorators/public.decorator';
import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthStateService } from './health-state.service';
import { SkipReadiness } from './skip-readiness.decorator';

/**
 * Public liveness + readiness endpoint, intentionally NOT under the
 * `/api/v1` prefix (see main.ts:101 `setGlobalPrefix({ exclude: ... })`).
 * K8s readinessProbe points here; the `Retry-After` header tells the
 * caller (and K8s) when to come back.
 *
 * Single endpoint, not split liveness/readiness: K8s liveness only
 * matters when the process is wedged — if Node can't respond at all,
 * K8s figures that out from the timeout, not from a 200/503. Adding
 * a separate `/health/live` would just duplicate the same code path
 * for no operational gain.
 *
 * `@Public()` and `@SkipReadiness()` are both required and neither
 * substitutes for the other:
 *   - `@SkipReadiness()` exempts the route from the global
 *     `ReadinessGuard`, which would otherwise answer 503 itself and
 *     hide the snapshot (and the recovery transition) from K8s.
 *   - `@Public()` exempts it from the global `AuthGuard`. Without it
 *     the probe gets 401 — a probe cannot present a bearer token, so
 *     the endpoint would be permanently "unready" to the only caller
 *     that matters.
 *
 * There is no information leak worth guarding here: the snapshot is
 * this process's own readiness state, and the alternative (a probe
 * that always 401s) is strictly worse than exposing it.
 */
@Public()
@SkipReadiness()
@Controller('health')
export class HealthController {
  constructor(private readonly state: HealthStateService) {}

  @Get()
  check(@Res({ passthrough: true }) res: Response) {
    const snapshot = this.state.getSnapshot();
    if (!snapshot.isReady) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      res.setHeader('Retry-After', '5');
    }
    return snapshot;
  }
}
