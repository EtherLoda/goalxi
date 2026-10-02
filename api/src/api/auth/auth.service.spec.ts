import { EmailQueueService } from '@/background/queues/email-queue/email-queue.service';
import { SessionEntity, UserEntity } from '@goalxi/database';
import { LOGGER_SERVICE } from '@goalxi/logger';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnboardingService } from '../onboarding/onboarding.service';
import { AuthService } from './auth.service';

jest.mock('@goalxi/database', () => ({
  // Spread the real module so only the two password functions are
  // replaced — a bare object here would blank out every entity and
  // constant the file also imports.
  ...jest.requireActual('@goalxi/database'),
  // `resetPassword` now pre-hashes the plaintext (the
  // `@BeforeUpdate` hook was removed from `UserEntity` to stop
  // the PATCH /users/me double-hash regression). The mock
  // mirrors the shape used in `user.service.spec.ts` so the
  // assertion can reason about a deterministic value.
  hashPassword: jest.fn(async (s: string) => `hashed:${s}`),
  verifyPassword: jest.fn(async () => true),
}));

describe('AuthService', () => {
  let service: AuthService;
  let configServiceValue: Partial<Record<keyof ConfigService, jest.Mock>>;
  let jwtServiceValue: Partial<Record<keyof JwtService, jest.Mock>>;
  let userRepositoryValue: Partial<
    Record<keyof Repository<UserEntity>, jest.Mock>
  >;
  let cacheManager: {
    set: jest.Mock;
    del: jest.Mock;
    store: { set: jest.Mock; get: jest.Mock };
  };
  let logger: {
    log: jest.Mock;
    error: jest.Mock;
    warn: jest.Mock;
    debug: jest.Mock;
    info: jest.Mock;
  };
  let sessionDeleteSpy: jest.SpyInstance;

  const futureExp = Math.floor(Date.now() / 1000) + 60 * 60; // +1h
  const pastExp = Math.floor(Date.now() / 1000) - 60; // -1m

  beforeAll(async () => {
    configServiceValue = {
      // `getOrThrow` falls through to `get` and throws on
      // undefined. `auth.*Expires` keys are ms-format strings
      // that get fed to `ms(...)` — returning the same
      // `'test-secret'` for those would parse to `undefined`
      // and break any code that writes to cache with a TTL.
      // The router below splits the two: secrets vs durations.
      get: jest.fn().mockImplementation((key: string) => {
        if (key.endsWith('Expires')) return '1d';
        return 'test-secret';
      }),
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key.endsWith('Expires')) return '1d';
        return 'test-secret';
      }),
    };

    jwtServiceValue = {
      sign: jest.fn(),
      signAsync: jest.fn(),
      verify: jest.fn(),
    };

    userRepositoryValue = {
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
    };

    cacheManager = {
      set: jest.fn(),
      del: jest.fn().mockResolvedValue(undefined),
      store: {
        set: jest.fn().mockResolvedValue(undefined),
        get: jest.fn(),
      },
    };

    logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: LOGGER_SERVICE,
          useValue: logger,
        },
        {
          provide: ConfigService,
          useValue: configServiceValue,
        },
        {
          provide: JwtService,
          useValue: jwtServiceValue,
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: userRepositoryValue,
        },
        {
          // P1-#13: AuthService now enqueues via the typed
          // EmailQueueService instead of injecting the raw queue.
          // The spec only needs a stub — the email flow itself
          // has its own spec. `addPasswordResetEmail` was added
          // alongside the forgot/verify/reset endpoints.
          provide: EmailQueueService,
          useValue: {
            addEmailVerification: jest.fn().mockResolvedValue(undefined),
            addPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: cacheManager,
        },
        {
          // Mock for the onboarding queue producer —
          // `AuthService.register` now enqueues an
          // `assign-team` job instead of doing the work
          // synchronously. The spec doesn't care whether the
          // job was actually enqueued (we have a separate
          // OnboardingService spec for that), it just needs
          // the dependency to resolve.
          provide: OnboardingService,
          useValue: {
            enqueueAssignTeam: jest.fn().mockResolvedValue(undefined),
            getOnboardingState: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager.store.set.mockResolvedValue(undefined);
    sessionDeleteSpy = jest
      .spyOn(SessionEntity, 'delete')
      .mockResolvedValue({ affected: 1, raw: [] } as any);
  });

  afterEach(() => {
    sessionDeleteSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('logout (regression for #14)', () => {
    it('deletes the DB session before blacklisting the access token', async () => {
      const callOrder: string[] = [];
      sessionDeleteSpy.mockImplementation(async () => {
        callOrder.push('db.delete');
        return { affected: 1, raw: [] } as any;
      });
      cacheManager.store.set.mockImplementation(async () => {
        callOrder.push('cache.set');
        return undefined as any;
      });

      await service.logout({
        id: 'user-1',
        sessionId: 'sess-1',
        role: 'user' as any,
        iat: 0,
        exp: futureExp,
      });

      // DB delete must happen first — the access-token blacklist
      // is only useful as belt-and-suspenders; the DB delete is
      // the one that kills the refresh-token path.
      expect(callOrder).toEqual(['db.delete', 'cache.set']);
      expect(sessionDeleteSpy).toHaveBeenCalledWith('sess-1');
      expect(cacheManager.store.set).toHaveBeenCalledTimes(1);
    });

    it('throws when the DB delete fails, and does NOT touch the blacklist', async () => {
      const dbError = new Error('postgres down');
      sessionDeleteSpy.mockRejectedValueOnce(dbError);

      await expect(
        service.logout({
          id: 'user-1',
          sessionId: 'sess-1',
          role: 'user' as any,
          iat: 0,
          exp: futureExp,
        }),
      ).rejects.toBe(dbError);

      // Critical: a failed DB delete must not also try to write
      // the blacklist — the user would think they're logged out
      // while the session row is still usable for refresh.
      expect(cacheManager.store.set).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('logout DB delete failed sessionId=sess-1'),
        expect.any(String),
      );
    });

    it('does NOT throw when the blacklist write fails (DB delete already succeeded)', async () => {
      cacheManager.store.set.mockRejectedValueOnce(new Error('redis is down'));

      await expect(
        service.logout({
          id: 'user-1',
          sessionId: 'sess-1',
          role: 'user' as any,
          iat: 0,
          exp: futureExp,
        }),
      ).resolves.toBeUndefined();

      expect(sessionDeleteSpy).toHaveBeenCalledWith('sess-1');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('blacklist set failed sessionId=sess-1'),
      );
    });

    it('skips the blacklist write when the access token has already expired', async () => {
      await service.logout({
        id: 'user-1',
        sessionId: 'sess-1',
        role: 'user' as any,
        iat: 0,
        exp: pastExp,
      });

      expect(sessionDeleteSpy).toHaveBeenCalledWith('sess-1');
      expect(cacheManager.store.set).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining(
          'skipped blacklist (access token already expired)',
        ),
      );
    });

    it('TTL on the blacklist entry equals the access token remaining lifetime', async () => {
      const ttlMs = (futureExp - Math.floor(Date.now() / 1000)) * 1000;
      await service.logout({
        id: 'user-1',
        sessionId: 'sess-1',
        role: 'user' as any,
        iat: 0,
        exp: futureExp,
      });

      expect(cacheManager.store.set).toHaveBeenCalledWith(
        expect.stringContaining('sess-1'),
        true,
        expect.any(Number),
      );
      const passedTtl = cacheManager.store.set.mock.calls[0][2] as number;
      // Allow a 5s window for test execution time vs the captured
      // `Date.now()` inside the service.
      expect(Math.abs(passedTtl - ttlMs)).toBeLessThan(5_000);
    });
  });

  describe('forgotPassword / verifyForgotPassword / resetPassword', () => {
    // The forgot/verify/reset flow shares one cached `hash`
    // per user. We model "the same token survives both verify
    // and reset" by feeding the same `{id, hash}` pair through
    // `jwtService.verify` for both calls. The service then
    // checks that the cached hash matches.

    const user = { id: 'user-1', email: 'a@b.com' };
    const forgotHash = 'forgot-hash-abc';

    beforeEach(() => {
      // `signAsync` is called by `createForgotPasswordToken`.
      // Return a stable token — the test doesn't decode it, it
      // mocks `jwtService.verify` to return whatever payload
      // the spec needs.
      jwtServiceValue.signAsync.mockResolvedValue('signed.jwt.token');
      jwtServiceValue.verify.mockReturnValue({
        id: user.id,
        hash: forgotHash,
      });
      cacheManager.store.get.mockResolvedValue(forgotHash);
    });

    it('forgotPassword: enqueues a reset email and caches the hash when the user exists', async () => {
      userRepositoryValue.findOne.mockResolvedValueOnce(user);

      const res = await service.forgotPassword({ email: user.email });

      expect(userRepositoryValue.findOne).toHaveBeenCalledWith({
        where: { email: user.email },
        select: ['id', 'email'],
      });
      // The hash written to cache is whatever the service
      // generated via crypto.createHash — we don't pin the
      // exact value, just verify it landed in the right key
      // with a numeric TTL. Pinning the value would force
      // the spec to copy the service's hash recipe, which
      // doesn't add coverage.
      expect(cacheManager.set).toHaveBeenCalledWith(
        expect.stringContaining('auth:token:user-1:password'),
        expect.stringMatching(/^[a-f0-9]{64}$/),
        expect.any(Number),
      );
      expect(res).toEqual({
        message: expect.any(String),
        devToken: undefined,
      });
    });

    it('forgotPassword: returns a uniform success response when the user does not exist (no enumeration)', async () => {
      userRepositoryValue.findOne.mockResolvedValueOnce(null);

      const res = await service.forgotPassword({ email: 'nope@nowhere.io' });

      // No cache write, no enqueue.
      expect(cacheManager.set).not.toHaveBeenCalled();
      expect(res).toEqual({
        message: expect.any(String),
        devToken: undefined,
      });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('forgotPassword no-op'),
      );
    });

    it('forgotPassword: in dev (MAIL_ENABLED=false) echoes the token so the FE can complete the flow', async () => {
      const prev = process.env.MAIL_ENABLED;
      process.env.MAIL_ENABLED = 'false';
      try {
        userRepositoryValue.findOne.mockResolvedValueOnce(user);
        const res = await service.forgotPassword({ email: user.email });
        expect(res.devToken).toBe('signed.jwt.token');
      } finally {
        if (prev === undefined) {
          delete process.env.MAIL_ENABLED;
        } else {
          process.env.MAIL_ENABLED = prev;
        }
      }
    });

    it('verifyForgotPassword: returns the userId when JWT + cache match', async () => {
      const res = await service.verifyForgotPassword({
        token: 'valid.token',
      });
      expect(res).toEqual({ userId: 'user-1' });
    });

    it('verifyForgotPassword: 401 when the cache hash is missing (token already redeemed or expired)', async () => {
      cacheManager.store.get.mockResolvedValueOnce(null);
      await expect(
        service.verifyForgotPassword({ token: 'stale.token' }),
      ).rejects.toMatchObject({ status: 401 });
    });

    it('verifyForgotPassword: 401 when the cache hash differs from the token hash', async () => {
      cacheManager.store.get.mockResolvedValueOnce('different-hash');
      await expect(
        service.verifyForgotPassword({ token: 'tampered.token' }),
      ).rejects.toMatchObject({ status: 401 });
    });

    it('verifyForgotPassword: 401 when the JWT is unparseable', async () => {
      jwtServiceValue.verify.mockImplementationOnce(() => {
        throw new Error('jwt malformed');
      });
      await expect(
        service.verifyForgotPassword({ token: 'garbage' }),
      ).rejects.toMatchObject({ status: 401 });
    });

    it('resetPassword: updates the password, revokes the token, and force-logs-out all sessions', async () => {
      const entity = {
        id: user.id,
        password: '',
        save: jest.fn().mockResolvedValue(undefined),
      };
      userRepositoryValue.findOneOrFail.mockResolvedValueOnce(entity);

      await service.resetPassword({
        token: 'valid.token',
        newPassword: 'newPass!1',
      });

      // 1. Plaintext is pre-hashed here (the service, not the
      //    entity hook) and the resulting argon2-shaped string is
      //    what `save()` actually writes. The pre-hash lives in
      //    the service to keep the contract uniform with
      //    `UserService.changePassword` and to keep the entity
      //    free of the @BeforeUpdate double-hash bug.
      expect(entity.password).toBe('hashed:newPass!1');
      expect(entity.save).toHaveBeenCalledTimes(1);
      // 2. Token cache cleared — no more live copies.
      expect(cacheManager.del).toHaveBeenCalledWith(
        expect.stringContaining('auth:token:user-1:password'),
      );
      // 3. Every session row for the user is dropped — same
      //    `SessionEntity.delete` mock used by `logout`.
      expect(sessionDeleteSpy).toHaveBeenCalledWith({ userId: user.id });
    });

    it('resetPassword: 401 when the cache hash is missing', async () => {
      cacheManager.store.get.mockResolvedValueOnce(null);
      await expect(
        service.resetPassword({ token: 'x', newPassword: 'newPass!1' }),
      ).rejects.toMatchObject({ status: 401 });
    });
  });
});
