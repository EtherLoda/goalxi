import { ValidationException } from '@/exceptions/validation.exception';
import {
  ForumCategoryEntity,
  ForumPostEntity,
  ForumReactionEntity,
  ForumThreadEntity,
  Uuid,
} from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ForumPostService } from './forum-post.service';
import { ForumThreadService } from './forum-thread.service';

describe('ForumPostService', () => {
  let service: ForumPostService;
  let postRepo: jest.Mocked<Repository<ForumPostEntity>>;
  let reactionRepo: jest.Mocked<Repository<ForumReactionEntity>>;
  let threadRepo: jest.Mocked<Repository<ForumThreadEntity>>;
  let categoryRepo: jest.Mocked<Repository<ForumCategoryEntity>>;
  let threadService: jest.Mocked<ForumThreadService>;

  const mockThread = new ForumThreadEntity({
    id: 'thread-1' as Uuid,
    categoryId: 'cat-1' as Uuid,
    authorId: 'user-1' as Uuid,
    title: 'Hello',
    body: 'A test thread body here.',
    replyCount: 0,
    hotScore: 0,
  });

  const mockPost = new ForumPostEntity({
    id: 'post-1' as Uuid,
    threadId: 'thread-1' as Uuid,
    authorId: 'user-2' as Uuid,
    body: 'A reply on the thread here.',
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ForumPostService,
        {
          provide: getRepositoryToken(ForumPostEntity),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            softRemove: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ForumReactionEntity),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ForumThreadEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ForumCategoryEntity),
          useValue: {
            increment: jest.fn(),
            decrement: jest.fn(),
          },
        },
        {
          provide: ForumThreadService,
          useValue: {
            incrementReplyCounters: jest.fn(),
            decrementReplyCounters: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ForumPostService>(ForumPostService);
    postRepo = module.get(getRepositoryToken(ForumPostEntity));
    reactionRepo = module.get(getRepositoryToken(ForumReactionEntity));
    threadRepo = module.get(getRepositoryToken(ForumThreadEntity));
    categoryRepo = module.get(getRepositoryToken(ForumCategoryEntity));
    threadService = module.get(ForumThreadService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  describe('listByThread', () => {
    it('throws F002 when thread not found', async () => {
      threadRepo.findOne.mockResolvedValue(null);
      await expect(
        service.listByThread('missing' as Uuid, {} as any),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it('returns paginated posts with reaction counts', async () => {
      threadRepo.findOne.mockResolvedValue(mockThread);

      const postQb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockPost]),
        getCount: jest.fn().mockResolvedValue(1),
      };
      postRepo.createQueryBuilder.mockReturnValue(
        postQb as unknown as SelectQueryBuilder<ForumPostEntity>,
      );

      const reactionQb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([{ postId: 'post-1', count: '3' }]),
      };
      reactionRepo.createQueryBuilder.mockReturnValue(reactionQb);

      const [data, pagination] = await service.listByThread(
        'thread-1' as Uuid,
        { page: 1, limit: 10 } as any,
      );
      expect(data).toHaveLength(1);
      expect(data[0].reactionCount).toBe(3);
      expect(pagination.totalRecords).toBe(1);
    });
  });

  describe('create', () => {
    it('creates a post, increments counters', async () => {
      threadRepo.findOne.mockResolvedValue(mockThread);
      postRepo.save.mockImplementation(async (p) => p as any);
      postRepo.findOne.mockResolvedValue(mockPost);
      const reactionQb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      reactionRepo.createQueryBuilder.mockReturnValue(reactionQb);

      const result = await service.create(
        'user-2' as Uuid,
        'thread-1' as Uuid,
        { body: 'A reply on the thread here.' },
      );

      expect(threadService.incrementReplyCounters).toHaveBeenCalledWith(
        'thread-1',
        'user-2',
        expect.any(Date),
      );
      expect(categoryRepo.increment).toHaveBeenCalledWith(
        { id: mockThread.categoryId },
        'postCount',
        1,
      );
      expect(result.id).toBe('post-1');
    });

    it('throws F002 when thread not found', async () => {
      threadRepo.findOne.mockResolvedValue(null);
      await expect(
        service.create('user-2' as Uuid, 'missing' as Uuid, {
          body: 'A reply on the thread here.',
        }),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe('softDelete', () => {
    it('throws F005 when requester is not author', async () => {
      postRepo.findOne.mockResolvedValue(mockPost);
      await expect(
        service.softDelete('post-1' as Uuid, 'other-user' as Uuid),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it('soft-deletes and decrements counters when requester is author', async () => {
      postRepo.findOne.mockResolvedValue(mockPost);
      threadRepo.findOne.mockResolvedValue(mockThread);

      await service.softDelete('post-1' as Uuid, 'user-2' as Uuid);

      expect(postRepo.softRemove).toHaveBeenCalledWith(mockPost);
      expect(threadService.decrementReplyCounters).toHaveBeenCalledWith(
        'thread-1',
        expect.any(Date),
      );
      expect(categoryRepo.decrement).toHaveBeenCalledWith(
        { id: mockThread.categoryId },
        'postCount',
        1,
      );
    });
  });
});
