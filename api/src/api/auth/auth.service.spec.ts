import { SessionEntity, UserEntity } from '@goalxi/database';
import { LOGGER_SERVICE } from '@goalxi/logger';
import { getQueueToken } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnboardingService } from '../onboarding/onboarding.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let configServiceValue: Partial<Record<keyof ConfigService, jest.Mock>>;
  let jwtServiceValue: Partial<Record<keyof JwtService, jest.Mock>>;
  let userRepositoryValue: Partial<
    Record<keyof Repository<UserEntity>, jest.Mock>
  >;
  let cacheManager: {
    set: jest.Mock;
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
      get: jest.fn(),
    };

    jwtServiceValue = {
      sign: jest.fn(),
      verify: jest.fn(),
    };

    userRepositoryValue = {
      findOne: jest.fn(),
    };

    cacheManager = {
      set: jest.fn(),
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
          provide: getQueueToken('email'),
          useValue: {
            add: jest.fn(),
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
});
