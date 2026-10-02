import { AuthService } from '@/api/auth/auth.service';
import { IS_PUBLIC } from '@/constants/app.constant';
import { AuthGuard } from '@/guards/auth.guard';
import { ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthStateService } from './health-state.service';
import { HealthController } from './health.controller';
import { ReadinessGuard } from './readiness.guard';
import { SKIP_READINESS } from './skip-readiness.decorator';

/**
 * `/health` is the K8s readinessProbe target. A probe cannot present a
 * bearer token, so the route has to be exempt from the global
 * `AuthGuard` — otherwise the probe gets 401 forever and the pod never
 * goes ready.
 *
 * This regressed once already: `@SkipReadiness()` was present (so the
 * route answered past the readiness gate) but `@Public()` was not, so
 * every caller saw 401. Nothing failed loudly — `pnpm build` was green
 * and all 713 api tests passed, because no test ever exercised the
 * guard metadata on this controller.
 *
 * These assertions run the real `AuthGuard` / `ReadinessGuard` against
 * the controller's actual metadata rather than reading the decorator
 * constants, so a guard rewrite that drops `IS_PUBLIC` support fails
 * here too.
 */
describe('HealthController', () => {
  const snapshot = {
    isReady: true,
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    uptimeSeconds: 42,
  };

  let controller: HealthController;
  let reflector: Reflector;
  let state: { getSnapshot: jest.Mock };

  const makeRes = () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    };
    return res;
  };

  const makeContext = (): any => ({
    getHandler: () => controller.check,
    getClass: () => HealthController,
    switchToHttp: () => ({
      // The guard only reads `headers`; a full Express Request is not
      // needed and would just be noise here.
      getRequest: () => ({ headers: {} }),
    }),
  });

  beforeEach(async () => {
    state = { getSnapshot: jest.fn(() => snapshot) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthStateService, useValue: state }],
    }).compile();

    controller = module.get(HealthController);
    reflector = module.get(Reflector);
  });

  describe('route metadata', () => {
    it('is marked public so the readinessProbe is not rejected', () => {
      const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        controller.check,
        HealthController,
      ]);
      expect(isPublic).toBe(true);
    });

    it('is exempt from the readiness guard', () => {
      const skip = reflector.getAllAndOverride<boolean>(SKIP_READINESS, [
        controller.check,
        HealthController,
      ]);
      expect(skip).toBe(true);
    });
  });

  describe('guards', () => {
    it('passes the real AuthGuard with no Authorization header', async () => {
      const guard = new AuthGuard(reflector, {
        verifyAccessToken: jest.fn(),
      } as unknown as AuthService);

      // Regression guard: this threw UnauthorizedException before
      // `@Public()` was added, which is what broke the K8s probe.
      await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    });

    it('never calls verifyAccessToken, so it cannot touch the session table', async () => {
      const verifyAccessToken = jest.fn();
      const guard = new AuthGuard(reflector, {
        verifyAccessToken,
      } as unknown as AuthService);

      await guard.canActivate(makeContext());

      expect(verifyAccessToken).not.toHaveBeenCalled();
    });

    it('passes the real ReadinessGuard even while not ready', () => {
      // `canActivate` is synchronous (returns a boolean, not a promise).
      const guard = new ReadinessGuard(
        { isReady: () => false } as unknown as HealthStateService,
        reflector,
      );

      // The guard must defer to the controller's own snapshot rather
      // than throwing 503 itself, otherwise the probe can never observe
      // the recovery transition it exists to observe.
      expect(guard.canActivate(makeContext())).toBe(true);
    });

    it('would still fail closed on a non-exempt route while not ready', () => {
      // Guards against "fixing" the probe by making ReadinessGuard a
      // no-op globally: some other route must still get 503.
      const guard = new ReadinessGuard(
        { isReady: () => false } as unknown as HealthStateService,
        reflector,
      );
      const otherContext = {
        ...makeContext(),
        getHandler: () => function otherHandler() {},
        getClass: () => class OtherController {},
      };

      expect(() => guard.canActivate(otherContext)).toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('check', () => {
    it('returns 200 and the snapshot when ready', () => {
      const res = makeRes();
      expect(controller.check(res as never)).toBe(snapshot);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 503 with Retry-After when not ready', () => {
      state.getSnapshot.mockReturnValue({ ...snapshot, isReady: false });
      const res = makeRes();

      controller.check(res as never);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '5');
    });
  });
});
