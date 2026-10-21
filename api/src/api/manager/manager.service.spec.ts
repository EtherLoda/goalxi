import { Uuid } from '@/common/types/common.type';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserEntity } from '@goalxi/database';
import { ManagerService } from './manager.service';

// `Uuid` is a branded string, so a bare literal is not assignable to the
// service signature.
const MANAGER_ID = '00000000-0000-4000-8000-000000000001' as Uuid;

function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return new UserEntity({
    id: MANAGER_ID,
    username: 't1_mcgrady',
    email: 'mcgrady@example.com',
    password: 'hash',
    bio: 'Playmaker at heart.',
    nickname: 'McGrady',
    avatar: 'https://cdn.example.com/a.png',
    supporterLevel: 2,
    role: 'user',
    onboardingStatus: 'active',
    preferredLanguage: 'zh',
    timezone: 'Asia/Shanghai',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  } as Partial<UserEntity>);
}

describe('ManagerService', () => {
  let service: ManagerService;
  const findOne = jest.fn();

  beforeEach(async () => {
    findOne.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManagerService,
        { provide: getRepositoryToken(UserEntity), useValue: { findOne } },
      ],
    }).compile();

    service = module.get(ManagerService);
  });

  it('maps an existing user to the public projection', async () => {
    findOne.mockResolvedValue(makeUser());

    const result = await service.findPublic(MANAGER_ID);

    expect(result).toEqual({
      id: MANAGER_ID,
      username: 't1_mcgrady',
      displayName: 'McGrady',
      avatar: 'https://cdn.example.com/a.png',
      bio: 'Playmaker at heart.',
      supporterLevel: 2,
      joinedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
  });

  it('falls back to the username when no nickname is set', async () => {
    findOne.mockResolvedValue(makeUser({ nickname: undefined }));
    await expect(service.findPublic(MANAGER_ID)).resolves.toMatchObject({
      displayName: 't1_mcgrady',
    });

    // A cleared form field writes an empty string, not undefined.
    findOne.mockResolvedValue(makeUser({ nickname: '   ' }));
    await expect(service.findPublic(MANAGER_ID)).resolves.toMatchObject({
      displayName: 't1_mcgrady',
    });
  });

  it('normalises empty avatar and bio to null', async () => {
    findOne.mockResolvedValue(makeUser({ avatar: '', bio: '' }));

    const result = await service.findPublic(MANAGER_ID);

    expect(result.avatar).toBeNull();
    expect(result.bio).toBeNull();
  });

  it('throws NotFound for an unknown id', async () => {
    findOne.mockResolvedValue(null);

    await expect(service.findPublic(MANAGER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  /**
   * The whole reason this DTO exists. If someone swaps
   * `toPublicResDto` for a spread of the entity, this test fails even
   * though every field above would still pass.
   */
  it('never exposes private account fields', async () => {
    findOne.mockResolvedValue(makeUser());

    const result = await service.findPublic(MANAGER_ID);
    const payload = result as unknown as Record<string, unknown>;

    for (const key of [
      'email',
      'password',
      'timezone',
      'preferredLanguage',
      'role',
      'onboardingStatus',
      'deletedAt',
    ]) {
      expect(payload).not.toHaveProperty(key);
    }
  });
});
