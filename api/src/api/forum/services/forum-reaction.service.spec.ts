import { ValidationException } from '@/exceptions/validation.exception';
import { ForumPostEntity, ForumReactionEntity, Uuid } from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ForumReactionService } from './forum-reaction.service';

describe('ForumReactionService', () => {
  let service: ForumReactionService;
  let reactionRepo: jest.Mocked<Repository<ForumReactionEntity>>;
  let postRepo: jest.Mocked<Repository<ForumPostEntity>>;

  const mockPost = new ForumPostEntity({
    id: 'post-1' as Uuid,
    threadId: 'thread-1' as Uuid,
    authorId: 'user-1' as Uuid,
    body: 'Reply body',
  });

  const mockReaction = new ForumReactionEntity({
    id: 'r-1' as Uuid,
    postId: 'post-1' as Uuid,
    userId: 'user-2' as Uuid,
    type: 'like' as any,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ForumReactionService,
        {
          provide: getRepositoryToken(ForumReactionEntity),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ForumPostEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ForumReactionService>(ForumReactionService);
    reactionRepo = module.get(getRepositoryToken(ForumReactionEntity));
    postRepo = module.get(getRepositoryToken(ForumPostEntity));
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  describe('toggle', () => {
    it('throws F003 when post not found', async () => {
      postRepo.findOne.mockResolvedValue(null);
      await expect(
        service.toggle('missing' as Uuid, 'user-1' as Uuid),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it('creates a reaction when none exists', async () => {
      postRepo.findOne.mockResolvedValue(mockPost);
      reactionRepo.findOne.mockResolvedValue(null);
      reactionRepo.save.mockImplementation(async (r) => r as any);
      reactionRepo.count.mockResolvedValue(1);

      const result = await service.toggle('post-1' as Uuid, 'user-2' as Uuid);
      expect(reactionRepo.save).toHaveBeenCalled();
      expect(result).toEqual({ count: 1, hasReacted: true });
    });

    it('deletes the reaction when one already exists (toggle off)', async () => {
      postRepo.findOne.mockResolvedValue(mockPost);
      reactionRepo.findOne.mockResolvedValue(mockReaction);
      reactionRepo.count.mockResolvedValue(0);

      const result = await service.toggle('post-1' as Uuid, 'user-2' as Uuid);
      expect(reactionRepo.delete).toHaveBeenCalledWith({ id: 'r-1' });
      expect(result).toEqual({ count: 0, hasReacted: false });
    });
  });

  describe('listForPost', () => {
    it('returns users and count', async () => {
      const r1 = Object.assign(
        Object.create(ForumReactionEntity.prototype),
        mockReaction,
        { user: { id: 'user-2' as Uuid, username: 'alice' } },
      );
      reactionRepo.find.mockResolvedValue([r1]);

      const result = await service.listForPost('post-1' as Uuid);
      expect(result.count).toBe(1);
      expect(result.users).toEqual([{ id: 'user-2', username: 'alice' }]);
    });
  });
});
