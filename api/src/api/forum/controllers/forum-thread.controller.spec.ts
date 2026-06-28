import { PageOptionsDto } from '@/common/dto/offset-pagination/page-options.dto';
import { ForumThreadSort } from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { CreateThreadReqDto } from '../dto/create-thread.req.dto';
import { ThreadResDto } from '../dto/thread.res.dto';
import { ForumThreadService } from '../services/forum-thread.service';
import { ForumThreadController } from './forum-thread.controller';

describe('ForumThreadController', () => {
  let controller: ForumThreadController;
  let service: jest.Mocked<ForumThreadService>;

  const mockThread: ThreadResDto = {
    id: 'thread-1',
    categoryId: 'cat-1',
    authorId: 'user-1',
    author: { id: 'user-1', username: 'alice' },
    title: 'Hello',
    body: 'A test body.',
    isPinned: false,
    replyCount: 0,
    lastReplyAt: null,
    lastReplyUserId: null,
    lastReplyUser: null,
    hotScore: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ForumThreadController],
      providers: [
        {
          provide: ForumThreadService,
          useValue: {
            listByCategory: jest.fn(),
            getById: jest.fn(),
            create: jest.fn(),
            softDelete: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ForumThreadController>(ForumThreadController);
    service = module.get(ForumThreadService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(controller).toBeDefined());

  describe('listByCategory', () => {
    it('returns paginated threads wrapped in {data, pagination}', async () => {
      service.listByCategory.mockResolvedValue([
        [mockThread],
        { totalRecords: 1 } as any,
      ]);
      const result = await controller.listByCategory(
        'cat-1' as any,
        { page: 1, limit: 10 } as PageOptionsDto,
      );
      expect(result.data).toEqual([mockThread]);
      expect(service.listByCategory).toHaveBeenCalledWith(
        'cat-1',
        expect.any(Object),
        ForumThreadSort.LATEST,
      );
    });
  });

  describe('create', () => {
    it('forces categoryId from URL param and reads requester from req.user', async () => {
      service.create.mockResolvedValue(mockThread);
      const dto: CreateThreadReqDto = {
        title: 'Hello',
        body: 'A test body.',
        categoryId: 'cat-1',
      };
      const req = { user: { id: 'user-1' } } as any;

      await controller.create('cat-1' as any, dto, req);
      expect(service.create).toHaveBeenCalledWith('user-1', {
        title: 'Hello',
        body: 'A test body.',
        categoryId: 'cat-1',
      });
    });
  });

  describe('getById', () => {
    it('returns thread wrapped in {data}', async () => {
      service.getById.mockResolvedValue(mockThread);
      const result = await controller.getById('thread-1' as any);
      expect(result.data).toEqual(mockThread);
    });
  });

  describe('delete', () => {
    it('soft-deletes using requester id', async () => {
      const req = { user: { id: 'user-1' } } as any;
      await controller.delete('thread-1' as any, req);
      expect(service.softDelete).toHaveBeenCalledWith('thread-1', 'user-1');
    });
  });
});
