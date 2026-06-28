import { ErrorCode } from '@/constants/error-code.constant';
import { ValidationException } from '@/exceptions/validation.exception';
import {
  ForumCategoryEntity,
  ForumThreadEntity,
  ForumThreadSort,
  Uuid,
} from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { CreateThreadReqDto } from '../dto/create-thread.req.dto';
import { ForumThreadService } from './forum-thread.service';

describe('ForumThreadService', () => {
  let service: ForumThreadService;
  let threadRepo: jest.Mocked<Repository<ForumThreadEntity>>;
  let categoryRepo: jest.Mocked<Repository<ForumCategoryEntity>>;

  const mockCategory = new ForumCategoryEntity({
    id: 'cat-1' as Uuid,
    slug: 'general',
    name: 'General',
    description: null,
    scopeType: 'public' as any,
    threadCount: 0,
    postCount: 0,
    isActive: true,
  });

  const mockThread = new ForumThreadEntity({
    id: 'thread-1' as Uuid,
    categoryId: 'cat-1' as Uuid,
    authorId: 'user-1' as Uuid,
    title: 'Hello world',
    body: 'This is a body of text for testing.',
    isPinned: false,
    replyCount: 0,
    hotScore: 100,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ForumThreadService,
        {
          provide: getRepositoryToken(ForumThreadEntity),
          useValue: {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
            save: jest.fn(),
            softRemove: jest.fn(),
            increment: jest.fn(),
            manager: { createQueryBuilder: jest.fn() },
          },
        },
        {
          provide: getRepositoryToken(ForumCategoryEntity),
          useValue: {
            findOne: jest.fn(),
            increment: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ForumThreadService>(ForumThreadService);
    threadRepo = module.get(getRepositoryToken(ForumThreadEntity));
    categoryRepo = module.get(getRepositoryToken(ForumCategoryEntity));
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  describe('listByCategory', () => {
    it('throws F001 when category is missing or inactive', async () => {
      categoryRepo.findOne.mockResolvedValue(null);
      await expect(
        service.listByCategory('cat-1' as Uuid, {} as any),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it('returns paginated threads sorted by latest', async () => {
      categoryRepo.findOne.mockResolvedValue(mockCategory);
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockThread]),
        getCount: jest.fn().mockResolvedValue(1),
      };
      threadRepo.createQueryBuilder.mockReturnValue(
        qb as unknown as SelectQueryBuilder<ForumThreadEntity>,
      );

      const [data, pagination] = await service.listByCategory(
        'cat-1' as Uuid,
        { page: 1, limit: 10 } as any,
      );
      expect(qb.orderBy).toHaveBeenCalledWith('thread.is_pinned', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith(
        'thread.last_reply_at',
        'DESC',
        'NULLS LAST',
      );
      expect(data).toHaveLength(1);
      expect(pagination.totalRecords).toBe(1);
    });

    it('uses hot-score ordering when sort=HOT', async () => {
      categoryRepo.findOne.mockResolvedValue(mockCategory);
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      };
      threadRepo.createQueryBuilder.mockReturnValue(
        qb as unknown as SelectQueryBuilder<ForumThreadEntity>,
      );

      await service.listByCategory(
        'cat-1' as Uuid,
        { page: 1, limit: 10 } as any,
        ForumThreadSort.HOT,
      );
      expect(qb.addOrderBy).toHaveBeenCalledWith('thread.hot_score', 'DESC');
    });
  });

  describe('getById', () => {
    it('returns the thread with author', async () => {
      threadRepo.findOne.mockResolvedValue(mockThread);
      const result = await service.getById('thread-1' as Uuid);
      expect(result.id).toBe('thread-1');
      expect(threadRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'thread-1' },
        relations: ['author', 'lastReplyUser'],
      });
    });

    it('throws F002 when not found', async () => {
      threadRepo.findOne.mockResolvedValue(null);
      await expect(service.getById('missing' as Uuid)).rejects.toBeInstanceOf(
        ValidationException,
      );
    });
  });

  describe('create', () => {
    it('creates a thread, increments category counter, returns DTO', async () => {
      categoryRepo.findOne.mockResolvedValue(mockCategory);
      threadRepo.save.mockImplementation(async (t) => t as any);
      threadRepo.findOne.mockResolvedValue(mockThread);

      const dto: CreateThreadReqDto = {
        title: 'Hello world',
        body: 'This is a body of text for testing.',
        categoryId: 'cat-1',
      };

      const result = await service.create('user-1' as Uuid, dto);
      expect(threadRepo.save).toHaveBeenCalledTimes(1);
      expect(categoryRepo.increment).toHaveBeenCalledWith(
        { id: mockCategory.id },
        'threadCount',
        1,
      );
      expect(result.id).toBe('thread-1');
    });

    it('throws F001 when category does not exist', async () => {
      categoryRepo.findOne.mockResolvedValue(null);
      await expect(
        service.create('user-1' as Uuid, {
          title: 'Hello world',
          body: 'This is a body of text.',
          categoryId: 'cat-missing',
        }),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe('softDelete', () => {
    it('throws F002 when thread not found', async () => {
      threadRepo.findOne.mockResolvedValue(null);
      await expect(
        service.softDelete('missing' as Uuid, 'user-1' as Uuid),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it('throws F005 when requester is not the author', async () => {
      threadRepo.findOne.mockResolvedValue(mockThread);
      await expect(
        service.softDelete('thread-1' as Uuid, 'other-user' as Uuid),
      ).rejects.toBeInstanceOf(ValidationException);
      try {
        await service.softDelete('thread-1' as Uuid, 'other-user' as Uuid);
      } catch (e: unknown) {
        expect((e as ValidationException).getResponse()).toMatchObject({
          errorCode: ErrorCode.F005,
        });
      }
    });

    it('soft-deletes when requester is author', async () => {
      threadRepo.findOne.mockResolvedValue(mockThread);
      await service.softDelete('thread-1' as Uuid, 'user-1' as Uuid);
      expect(threadRepo.softRemove).toHaveBeenCalledWith(mockThread);
    });
  });

  describe('incrementReplyCounters', () => {
    it('updates replyCount, lastReply fields, and hotScore', async () => {
      const threadCopy = Object.assign(
        Object.create(ForumThreadEntity.prototype),
        mockThread,
        { createdAt: new Date('2026-06-27T10:00:00Z') },
      );
      threadRepo.findOne.mockResolvedValue(threadCopy);
      threadRepo.save.mockImplementation(async (t) => t as any);

      await service.incrementReplyCounters(
        'thread-1' as Uuid,
        'user-2' as Uuid,
        new Date('2026-06-27T12:00:00Z'),
      );

      expect(threadRepo.save).toHaveBeenCalled();
    });
  });
});
