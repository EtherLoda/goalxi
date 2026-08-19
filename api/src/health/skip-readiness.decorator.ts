import { SetMetadata } from '@nestjs/common';

export const SKIP_READINESS = 'goalxi:skipReadiness';

/**
 * Mark a controller / route as exempt from the global `ReadinessGuard`.
 * Used on the `/health` endpoint itself — otherwise a 503 from the
 * guard would prevent K8s from ever seeing the recovery transition.
 */
export const SkipReadiness = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_READINESS, true);
