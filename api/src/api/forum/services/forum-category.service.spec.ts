import { ErrorCode } from '@/constants/error-code.constant';
import { ValidationException } from '@/exceptions/validation.exception';
import { ForumCategoryEntity, Uuid } from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryResDto } from '../dto/category.res.dto';
import { ForumCategoryService } from './forum-category.service';

describe('ForumCategoryService', () => {
  let service: ForumCategoryService;
  let repo: jest.Mocked<Repository<ForumCategoryEntity>>;

  const mockCategory = new ForumCategoryEntity({
    id: 'cat-1' as Uuid,
    slug: 'announcements',
    name: 'Announcements',
    description: 'Official news',
    scopeType: 'public' as any,
    threadCount: 5,
    postCount: 20,
    isActive: true,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ForumCategoryService,
        {
          provide: getRepositoryToken(ForumCategoryEntity),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ForumCategoryService>(ForumCategoryService);
    repo = module.get(getRepositoryToken(ForumCategoryEntity));
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listActive', () => {
    it('returns active categories ordered by name', async () => {
      repo.find.mockResolvedValue([mockCategory]);
      const result = await service.listActive();
      expect(repo.find).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { name: 'ASC' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(CategoryResDto);
      expect(result[0].slug).toBe('announcements');
    });

    it('returns empty array when no categories', async () => {
      repo.find.mockResolvedValue([]);
      const result = await service.listActive();
      expect(result).toEqual([]);
    });
  });

  describe('getBySlug', () => {
    it('returns the category when found and active', async () => {
      repo.findOne.mockResolvedValue(mockCategory);
      const result = await service.getBySlug('announcements');
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { slug: 'announcements', isActive: true },
      });
      expect(result.slug).toBe('announcements');
    });

    it('throws F001 when category not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getBySlug('missing')).rejects.toBeInstanceOf(
        ValidationException,
      );
      try {
        await service.getBySlug('missing');
      } catch (e: unknown) {
        expect((e as ValidationException).getResponse()).toMatchObject({
          errorCode: ErrorCode.F001,
        });
      }
    });
  });

  describe('getById', () => {
    it('returns the category when found', async () => {
      repo.findOne.mockResolvedValue(mockCategory);
      const result = await service.getById('cat-1' as Uuid);
      expect(result.id).toBe('cat-1');
    });

    it('throws F001 when not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getById('missing' as Uuid)).rejects.toBeInstanceOf(
        ValidationException,
      );
    });
  });
});
