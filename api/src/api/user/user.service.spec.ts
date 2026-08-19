import { verifyPassword } from '@/utils/password.util';
import { SessionEntity, UserEntity } from '@goalxi/database';
import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChangePasswordReqDto } from './dto/change-password.req.dto';
import { UserService } from './user.service';

jest.mock('@/utils/password.util', () => ({
  // The service used to pre-hash here. After the
  // `isDirty('password')` guard landed on
  // `UserEntity.@BeforeUpdate`, pre-hashing would race the hook
  // and produce `argon2(argon2(plain))` — locked the user out
  // on the next login. The plaintext is now assigned directly
  // and the entity hook is the single source of hashing.
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(async () => true),
}));

describe('UserService.changePassword', () => {
  let service: UserService;
  let userRepo: { findOneByOrFail: jest.Mock; save: jest.Mock };
  const { hashPassword } = jest.requireMock('@/utils/password.util') as {
    hashPassword: jest.Mock;
  };

  const buildUser = (overrides: Partial<UserEntity> = {}) => {
    const u = new UserEntity();
    Object.assign(u, {
      id: 'u-1',
      password: 'hashed:oldpw',
      ...overrides,
    });
    return u;
  };

  beforeEach(async () => {
    userRepo = {
      findOneByOrFail: jest.fn(),
      save: jest.fn(async (u: UserEntity) => u),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    jest.clearAllMocks();
  });

  it('throws UnauthorizedException when the current password is wrong', async () => {
    userRepo.findOneByOrFail.mockResolvedValueOnce(buildUser());
    (verifyPassword as jest.Mock).mockResolvedValueOnce(false);

    const dto = {
      currentPassword: 'wrong',
      newPassword: 'newpw123',
    } as ChangePasswordReqDto;

    await expect(
      service.changePassword('u-1' as any, 's-current' as any, dto),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('assigns plaintext, lets the entity hook hash, and keeps the current session alive', async () => {
    const user = buildUser();
    userRepo.findOneByOrFail.mockResolvedValueOnce(user);
    (verifyPassword as jest.Mock).mockResolvedValueOnce(true);

    const deleteSpy = jest
      .spyOn(SessionEntity, 'delete')
      .mockResolvedValueOnce({ affected: 3 } as any);

    const dto = {
      currentPassword: 'oldpw',
      newPassword: 'newpw123',
    } as ChangePasswordReqDto;

    await service.changePassword('u-1' as any, 's-current' as any, dto);

    // 1. verified the current password
    expect(verifyPassword).toHaveBeenCalledWith('oldpw', 'hashed:oldpw');

    // 2. plaintext assigned, NO pre-hash on the service side
    //    (the entity hook is what hashes; covered separately by
    //    libs/database/src/entities/user.entity.spec.ts).
    expect(user.password).toBe('newpw123');
    expect(hashPassword).not.toHaveBeenCalled();
    expect(userRepo.save).toHaveBeenCalledWith(user);

    // 3. deleted every other session, kept the current one
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    const criteria = deleteSpy.mock.calls[0][0] as any;
    expect(criteria.userId).toBe('u-1');
    // The `id: Not('s-current')` clause is the *whole point* of the
    // "keep current, kill the rest" policy — assert its presence.
    expect(JSON.stringify(criteria.id)).toContain('s-current');
  });
});
