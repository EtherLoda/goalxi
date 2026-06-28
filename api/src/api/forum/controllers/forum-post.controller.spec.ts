import { PageOptionsDto } from '@/common/dto/offset-pagination/page-options.dto';
import { Test, TestingModule } from '@nestjs/testing';
import { CreatePostReqDto } from '../dto/create-post.req.dto';
import { PostResDto } from '../dto/post.res.dto';
import { ForumPostService } from '../services/forum-post.service';
import { ForumPostController } from './forum-post.controller';

describe('ForumPostController', () => {
  let controller: ForumPostController;
  let service: jest.Mocked<ForumPostService>;

  const mockPost: PostResDto = {
    id: 'post-1',
    threadId: 'thread-1',
    authorId: 'user-1',
    author: { id: 'user-1', username: 'alice' },
    body: 'A reply.',
    reactionCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ForumPostController],
      providers: [
        {
          provide: ForumPostService,
          useValue: {
            listByThread: jest.fn(),
            create: jest.fn(),
            softDelete: jest.fn(),
            getById: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ForumPostController>(ForumPostController);
    service = module.get(ForumPostService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(controller).toBeDefined());

  describe('listByThread', () => {
    it('returns paginated posts wrapped in {data, pagination}', async () => {
      service.listByThread.mockResolvedValue([
        [mockPost],
        { totalRecords: 1 } as any,
      ]);
      const result = await controller.listByThread(
        'thread-1' as any,
        { page: 1, limit: 10 } as PageOptionsDto,
      );
      expect(result.data).toEqual([mockPost]);
    });
  });

  describe('create', () => {
    it('passes requester id from req.user', async () => {
      service.create.mockResolvedValue(mockPost);
      const dto: CreatePostReqDto = { body: 'A reply of sufficient length.' };
      const req = { user: { id: 'user-2' } } as any;

      await controller.create('thread-1' as any, dto, req);
      expect(service.create).toHaveBeenCalledWith('user-2', 'thread-1', dto);
    });
  });

  describe('delete', () => {
    it('soft-deletes using requester id', async () => {
      const req = { user: { id: 'user-2' } } as any;
      await controller.delete('post-1' as any, req);
      expect(service.softDelete).toHaveBeenCalledWith('post-1', 'user-2');
    });
  });
});
