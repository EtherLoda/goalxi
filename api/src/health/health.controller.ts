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
 */
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
