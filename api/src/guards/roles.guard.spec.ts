import { ROLES_KEY } from '@/decorators/roles.decorator';
import { UserRole } from '@goalxi/database';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  const buildContext = (user?: { role?: UserRole }): ExecutionContext => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
        getResponse: () => ({}),
        getNext: () => () => undefined,
      }),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getType: jest.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();
    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow access when no @Roles() metadata is present', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const ctx = buildContext({ role: UserRole.USER });

      expect(guard.canActivate(ctx)).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]);
    });

    it('should allow access when the user role is in the required list', () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
      const ctx = buildContext({ role: UserRole.ADMIN });

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should throw 403 when the user role is not in the required list', () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
      const ctx = buildContext({ role: UserRole.USER });

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should throw 403 when the request has no user (defence in depth)', () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
      const ctx = buildContext(undefined);

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should throw 403 when the user has no role field (legacy token)', () => {
      // Old access tokens issued before the RBAC migration carry no
      // `role` claim. Reject them with 403 so the user is forced to
      // re-authenticate and pick up the new payload.
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
      const ctx = buildContext({});

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});
