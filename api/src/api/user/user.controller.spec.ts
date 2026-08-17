import { Uuid } from '@/common/types/common.type';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserReqDto } from './dto/create-user.req.dto';
import { UserResDto } from './dto/user.res.dto';
import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('UserController', () => {
  let controller: UserController;
  let service: UserService;
  let userServiceValue: {
    findOne: jest.Mock;
    create: jest.Mock;
    findAll: jest.Mock;
    loadMoreUsers: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    updateMe: jest.Mock;
    changePassword: jest.Mock;
  };

  const buildRes = (overrides: Partial<UserResDto> = {}): UserResDto => {
    const dto = new UserResDto();
    dto.id = '1';
    dto.username = 'john';
    dto.email = 'mail@example.com';
    dto.bio = 'bio';
    dto.avatar = 'avatar.png';
    dto.nickname = 'Johnny';
    dto.supporterLevel = 1;
    dto.preferredLanguage = 'en';
    dto.timezone = 'UTC';
    dto.createdAt = new Date();
    dto.updatedAt = new Date();
    return Object.assign(dto, overrides);
  };

  beforeAll(async () => {
    userServiceValue = {
      findOne: jest.fn(),
      create: jest.fn(),
      findAll: jest.fn(),
      loadMoreUsers: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      updateMe: jest.fn(),
      changePassword: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: userServiceValue,
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    service = module.get<UserService>(UserService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  describe('getCurrentUser', () => {
    it('returns the current user from the JWT payload', async () => {
      const res = buildRes({ id: 'me-1' });
      userServiceValue.findOne.mockReturnValueOnce(res);

      const user = await controller.getCurrentUser('me-1' as Uuid);

      expect(user).toBe(res);
      expect(userServiceValue.findOne).toHaveBeenCalledWith('me-1');
    });
  });

  describe('createUser', () => {
    it('should return a user', async () => {
      const createUserReqDto = {
        username: 'john',
        email: 'mail@example.com',
        password: 'password',
        bio: 'bio',
      } as CreateUserReqDto;

      const userResDto = buildRes();

      userServiceValue.create.mockReturnValue(userResDto);
      const user = await controller.createUser(createUserReqDto);

      expect(user).toBe(userResDto);
      expect(userServiceValue.create).toHaveBeenCalledWith(createUserReqDto);
      expect(userServiceValue.create).toHaveBeenCalledTimes(1);
    });

    it('should return null', async () => {
      userServiceValue.create.mockReturnValue(null);
      const user = await controller.createUser({} as CreateUserReqDto);

      expect(user).toBeNull();
      expect(userServiceValue.create).toHaveBeenCalledWith({});
      expect(userServiceValue.create).toHaveBeenCalledTimes(1);
    });

    describe('CreateUserReqDto', () => {
      let createUserReqDto: CreateUserReqDto;

      beforeEach(() => {
        createUserReqDto = plainToInstance(CreateUserReqDto, {
          username: 'john',
          email: 'mail@example.com',
          password: 'password',
          bio: 'bio',
        });
      });

      it('should success with correctly data', async () => {
        const errors = await validate(createUserReqDto);
        expect(errors.length).toEqual(0);
      });

      it('should fail with empty username', async () => {
        createUserReqDto.username = '';
        const errors = await validate(createUserReqDto);
        expect(errors.length).toEqual(1);
        expect(errors[0].constraints).toEqual({
          minLength: 'username must be longer than or equal to 1 characters',
        });
      });

      it('should fail with empty email', async () => {
        createUserReqDto.email = '';
        const errors = await validate(createUserReqDto);
        expect(errors.length).toEqual(1);
        expect(errors[0].property).toBe('email');
      });

      it('should fail with invalid email', async () => {
        createUserReqDto.email = 'invalid-email';
        const errors = await validate(createUserReqDto);
        expect(errors.length).toEqual(1);
        expect(errors[0].constraints).toEqual({
          isEmail: 'email must be an email',
        });
      });

      it('should fail with empty password', async () => {
        createUserReqDto.password = '';
        const errors = await validate(createUserReqDto);
        expect(errors.length).toEqual(1);
        expect(errors[0].constraints).toEqual({
          minLength: 'password must be longer than or equal to 6 characters',
        });
      });

      it('should fail with invalid password', async () => {
        createUserReqDto.password = 'invalid-password';
        const errors = await validate(createUserReqDto);
        expect(errors.length).toEqual(1);
        expect(errors[0].constraints).toEqual({
          isPassword: 'password is invalid',
        });
      });

      it('should fail with empty bio', async () => {
        createUserReqDto.bio = '';
        const errors = await validate(createUserReqDto);
        expect(errors.length).toEqual(1);
        expect(errors[0].constraints).toEqual({
          minLength: 'bio must be longer than or equal to 1 characters',
        });
      });

      it('should success with bio is null', async () => {
        createUserReqDto.bio = null;
        const errors = await validate(createUserReqDto);
        expect(errors.length).toEqual(0);
      });

      it('should success with bio is undefined', async () => {
        createUserReqDto.bio = undefined;
        const errors = await validate(createUserReqDto);
        expect(errors.length).toEqual(0);
      });
    });
  });

  describe('findAllUsers', () => {
    it('forwards the query DTO to the service', async () => {
      const paginated = {
        data: [buildRes()],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      } as any;
      userServiceValue.findAll.mockReturnValueOnce(paginated);

      const reqDto = { page: 1, limit: 10 } as any;
      const result = await controller.findAllUsers(reqDto);

      expect(result).toBe(paginated);
      expect(userServiceValue.findAll).toHaveBeenCalledWith(reqDto);
    });
  });

  describe('loadMoreUsers', () => {
    it('forwards the cursor DTO to the service', async () => {
      const paginated = {
        data: [buildRes()],
        meta: { nextCursor: null, hasMore: false },
      } as any;
      userServiceValue.loadMoreUsers.mockReturnValueOnce(paginated);

      const reqDto = { cursor: 'abc', limit: 20 } as any;
      const result = await controller.loadMoreUsers(reqDto);

      expect(result).toBe(paginated);
      expect(userServiceValue.loadMoreUsers).toHaveBeenCalledWith(reqDto);
    });
  });

  describe('findUser', () => {
    it('should return a user', async () => {
      const userResDto = buildRes();

      userServiceValue.findOne.mockReturnValue(userResDto);
      const user = await controller.findUser('1' as Uuid);

      expect(user).toBe(userResDto);
      expect(userServiceValue.findOne).toHaveBeenCalledWith('1');
      expect(userServiceValue.findOne).toHaveBeenCalledTimes(1);
    });

    it('should return null', async () => {
      userServiceValue.findOne.mockReturnValue(null);
      const user = await controller.findUser('1' as Uuid);

      expect(user).toBeNull();
      expect(userServiceValue.findOne).toHaveBeenCalledWith('1');
      expect(userServiceValue.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateUser', () => {
    it('forwards the id + dto to the service', async () => {
      const res = buildRes({ nickname: 'Updated' });
      userServiceValue.update.mockReturnValueOnce(res);

      const reqDto = { nickname: 'Updated' } as any;
      const result = await controller.updateUser('u-1' as Uuid, reqDto);

      expect(result).toBe(res);
      expect(userServiceValue.update).toHaveBeenCalledWith('u-1', reqDto);
    });
  });

  describe('removeUser', () => {
    it('forwards the id to the service', async () => {
      userServiceValue.remove.mockReturnValueOnce(undefined);

      await controller.removeUser('u-1' as Uuid);

      expect(userServiceValue.remove).toHaveBeenCalledWith('u-1');
      expect(userServiceValue.remove).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateMyProfile', () => {
    it('resolves the user id from the JWT payload (no caller-supplied id)', async () => {
      const res = buildRes({ timezone: 'Asia/Shanghai' });
      userServiceValue.updateMe.mockReturnValueOnce(res);

      const reqDto = { timezone: 'Asia/Shanghai' } as any;
      const result = await controller.updateMyProfile('u-1' as Uuid, reqDto);

      expect(result).toBe(res);
      expect(userServiceValue.updateMe).toHaveBeenCalledWith('u-1', reqDto);
      expect(userServiceValue.updateMe).toHaveBeenCalledTimes(1);
    });

    it('forwards an empty body to the service unchanged', async () => {
      const res = buildRes();
      userServiceValue.updateMe.mockReturnValueOnce(res);

      const result = await controller.updateMyProfile('u-1' as Uuid, {} as any);

      expect(result).toBe(res);
      expect(userServiceValue.updateMe).toHaveBeenCalledWith('u-1', {});
    });
  });

  describe('changePassword', () => {
    it('forwards (userId, sessionId, dto) so the service can keep the current session alive', async () => {
      userServiceValue.changePassword.mockReturnValueOnce(undefined);

      const dto = { currentPassword: 'old', newPassword: 'newpass123' } as any;
      await controller.changePassword(
        { id: 'u-1' as Uuid, sessionId: 's-current' as Uuid },
        dto,
      );

      expect(userServiceValue.changePassword).toHaveBeenCalledWith(
        'u-1',
        's-current',
        dto,
      );
      expect(userServiceValue.changePassword).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Route-ordering regression. NestJS matches routes in the
   * order they're declared on the controller. If a `me` route
   * (literal segment) is registered after a `:id` route, the
   * `:id` variant wins and `ParseUUIDPipe` throws on the
   * literal string `"me"`. The Settings page reproduces this as
   * "Validation failed (uuid is expected)" whenever the user
   * tries to switch language or timezone.
   *
   * We assert the source order by reflecting on the controller
   * prototype and reading the method-level `PATH_METADATA` /
   * `METHOD_METADATA` that NestJS's route decorators store. The
   * declared order in `UserController.prototype` is the same
   * order NestJS will register the routes at boot.
   */
  describe('route declaration order', () => {
    it('declares the literal `me` routes BEFORE the `:id` variants', () => {
      const methods = Object.getOwnPropertyNames(UserController.prototype)
        .filter((name) => name !== 'constructor')
        .map((name) => {
          const fn = (
            UserController.prototype as unknown as Record<string, Function>
          )[name];
          return {
            name,
            path: Reflect.getMetadata(PATH_METADATA, fn) as string | undefined,
            method: Reflect.getMetadata(METHOD_METADATA, fn) as
              | string
              | undefined,
          };
        })
        .filter((m) => m.path !== undefined);

      // The first `:id` route we register sets the "everything
      // after this is UUID-bound" line. Every `me` route that
      // shows up AFTER that line is broken. We don't pin specific
      // indices (those shift with refactors) — we just check
      // that all `me`-bearing routes appear before any `:id`
      // route.
      const timeline = methods.map((m) => `${m.method} ${m.path}`);
      const firstIdIndex = timeline.findIndex((entry) => /:id/.test(entry));
      const meAfterId = timeline
        .slice(firstIdIndex + 1)
        .filter((entry) => /\/me(\/|$)/.test(entry));

      expect(firstIdIndex).toBeGreaterThanOrEqual(0);
      expect(meAfterId).toEqual([]);
    });
  });
});
