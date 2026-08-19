import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HealthStateService } from './health-state.service';
import { SKIP_READINESS } from './skip-readiness.decorator';

/**
 * Global fail-fast guard. When the DB probe has flipped the
 * readiness state to 'failing', this guard rejects every incoming
 * request with 503 + `Retry-After` before it can touch the
 * controller, the auth layer, or any DB-backed service.
 *
 * Why before AuthGuard: AuthGuard queries the session table. If
 * the DB is down, AuthGuard itself becomes the failure source —
 * every request queues for the connection timeout, latency
 * spikes, and the user-facing 503 is the same as the auth 401
 * plus a 5s wait. Gating on readiness first means failing fast.
 *
 * Excludes routes marked with `@SkipReadiness()` (the `/health`
 * endpoint), since the probe itself needs to be reachable during
 * the outage for K8s to detect recovery.
 */
@Injectable()
export class ReadinessGuard implements CanActivate {
  constructor(
    private readonly state: HealthStateService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean | undefined>(
      SKIP_READINESS,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

    if (!this.state.isReady()) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        message:
          'Service is not ready — database dependency is failing. Retry shortly.',
        retryAfterSeconds: 5,
      });
    }
    return true;
  }
}
